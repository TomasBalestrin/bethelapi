import { supabaseAdmin } from '@/lib/supabase';
import { sendToMetaCapi, getRetryDelay, MAX_RETRIES, BATCH_SIZE, formatForCapi } from '@/lib/meta-capi';
import type { Event, Pixel } from '@/types/database';

export interface DispatchResult {
  processed: number;
  sent: number;
  failed: number;
  recovered: number;
  expired: number;
}

// Max time (minutes) an event can stay in 'processing' before being recovered
const STUCK_THRESHOLD_MINUTES = 5;

// Max time (hours) an event can stay in 'queued' before being marked as failed
const QUEUE_EXPIRY_HOURS = 3;

export async function processEventQueue(): Promise<DispatchResult> {
  let recovered = 0;
  let expired = 0;

  // 0a. Recover stuck events: reset 'processing' events older than 5min back to 'queued'
  try {
    const stuckSince = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const { data: stuckEvents } = await supabaseAdmin
      .from('events')
      .update({
        status: 'queued',
        processing_at: null,
        error_message: `Recuperado: preso em processing por >${STUCK_THRESHOLD_MINUTES}min`,
      })
      .eq('status', 'processing')
      .lt('processing_at', stuckSince)
      .select('event_id');

    recovered = stuckEvents?.length || 0;
    if (recovered > 0) {
      console.log(`Recovered ${recovered} stuck events from processing → queued`);
    }
  } catch (err) {
    console.error('Stuck recovery error:', err);
  }

  // 0b. Expire old queued events: mark events in queue >3h as failed
  try {
    const expiredSince = new Date(Date.now() - QUEUE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    const { data: expiredEvents } = await supabaseAdmin
      .from('events')
      .update({
        status: 'failed',
        error_message: `Expirado: na fila por mais de ${QUEUE_EXPIRY_HOURS}h sem processamento`,
      })
      .eq('status', 'queued')
      .lt('queued_at', expiredSince)
      .select('event_id');

    expired = expiredEvents?.length || 0;
    if (expired > 0) {
      console.log(`Expired ${expired} events queued for >${QUEUE_EXPIRY_HOURS}h → failed`);
    }
  } catch (err) {
    console.error('Queue expiry error:', err);
  }

  // 1. Claim batch of events using SKIP LOCKED function
  const { data: events, error: claimError } = await supabaseAdmin.rpc('claim_events', {
    p_batch_size: BATCH_SIZE,
  });

  if (claimError) {
    console.error('Claim events error:', claimError);
    throw new Error('Failed to claim events');
  }

  if (!events || events.length === 0) {
    return { processed: 0, sent: 0, failed: 0, recovered, expired };
  }

  // 2. Group events by pixel_uuid
  const groupedByPixel = new Map<string, Event[]>();
  for (const event of events as Event[]) {
    const key = event.pixel_uuid || 'unknown';
    if (!groupedByPixel.has(key)) {
      groupedByPixel.set(key, []);
    }
    groupedByPixel.get(key)!.push(event);
  }

  let totalSent = 0;
  let totalFailed = 0;

  // 3. Process each pixel group
  for (const [pixelUuid, pixelEvents] of groupedByPixel) {
    const eventIds = pixelEvents.map((e) => e.event_id);

    if (pixelUuid === 'unknown') {
      await batchMarkFailed(eventIds, 'No pixel_uuid associated');
      totalFailed += pixelEvents.length;
      continue;
    }

    // Fetch pixel config
    const { data: pixel, error: pixelError } = await supabaseAdmin
      .from('pixels')
      .select('*')
      .eq('id', pixelUuid)
      .eq('is_active', true)
      .single();

    if (pixelError || !pixel) {
      await batchMarkFailed(eventIds, 'Pixel not found or inactive');
      totalFailed += pixelEvents.length;
      continue;
    }

    // 4. Send batch to Meta CAPI
    try {
      // Format payloads in batch
      const capiPayloads = pixelEvents.map((event) => ({
        event_id: event.event_id,
        payload_capi: formatForCapi(event),
      }));

      // Batch update payload_capi (single query per batch instead of N queries)
      for (const item of capiPayloads) {
        await supabaseAdmin
          .from('events')
          .update({ payload_capi: item.payload_capi })
          .eq('event_id', item.event_id);
      }

      const fbSendStart = Date.now();
      const result = await sendToMetaCapi(pixelEvents, pixel as Pixel);
      const fbApiLatencyMs = Date.now() - fbSendStart;

      const enrichedResponse = {
        ...result.response,
        fb_api_latency_ms: fbApiLatencyMs,
      };

      if (result.success) {
        // Batch update all events to 'sent' status
        const sentAt = new Date().toISOString();
        await supabaseAdmin
          .from('events')
          .update({
            status: 'sent',
            sent_at: sentAt,
            meta_response: enrichedResponse,
          })
          .in('event_id', eventIds);

        totalSent += pixelEvents.length;
      } else {
        // Batch update meta_response, then handle failures individually (retry logic differs)
        await supabaseAdmin
          .from('events')
          .update({ meta_response: enrichedResponse })
          .in('event_id', eventIds);

        for (const event of pixelEvents) {
          await markFailed(event, `[${result.statusCode}] ${enrichedResponse.error?.message || JSON.stringify(enrichedResponse).substring(0, 500)}`);
          totalFailed++;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      for (const event of pixelEvents) {
        await markFailed(event, errorMsg);
        totalFailed++;
      }
    }
  }

  return { processed: events.length, sent: totalSent, failed: totalFailed, recovered, expired };
}

async function batchMarkFailed(eventIds: string[], errorMessage: string) {
  await supabaseAdmin
    .from('events')
    .update({
      status: 'failed',
      error_message: errorMessage,
    })
    .in('event_id', eventIds);
}

async function markFailed(event: Event, errorMessage: string) {
  const newRetries = event.retries + 1;

  if (newRetries >= MAX_RETRIES) {
    await supabaseAdmin.rpc('move_to_dlq', {
      p_event_id: event.event_id,
      p_reason: categorizeError(errorMessage),
    });
  } else {
    const delay = getRetryDelay(newRetries);
    const nextRetryAt = new Date(Date.now() + delay * 1000).toISOString();

    await supabaseAdmin
      .from('events')
      .update({
        status: 'failed',
        retries: newRetries,
        next_retry_at: nextRetryAt,
        error_message: errorMessage,
      })
      .eq('event_id', event.event_id);
  }
}

function categorizeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('auth') || lower.includes('token') || lower.includes('permission')) {
    return 'auth_error';
  }
  if (lower.includes('rate') || lower.includes('limit') || lower.includes('throttl')) {
    return 'rate_limit';
  }
  if (lower.includes('timeout') || lower.includes('abort') || lower.includes('timed out')) {
    return 'timeout';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnre')) {
    return 'network_error';
  }
  if (lower.includes('payload') || lower.includes('invalid') || lower.includes('required')) {
    return 'payload_error';
  }
  return 'unknown';
}
