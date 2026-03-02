import { supabaseAdmin } from '@/lib/supabase';
import { sendToMetaCapi, getRetryDelay, MAX_RETRIES, BATCH_SIZE, formatForCapi } from '@/lib/meta-capi';
import type { Event, Pixel } from '@/types/database';

export interface DispatchResult {
  processed: number;
  sent: number;
  failed: number;
}

export async function processEventQueue(): Promise<DispatchResult> {
  // 1. Claim batch of events using SKIP LOCKED function
  const { data: events, error: claimError } = await supabaseAdmin.rpc('claim_events', {
    p_batch_size: BATCH_SIZE,
  });

  if (claimError) {
    console.error('Claim events error:', claimError);
    throw new Error('Failed to claim events');
  }

  if (!events || events.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
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
    if (pixelUuid === 'unknown') {
      for (const event of pixelEvents) {
        await markFailed(event, 'No pixel_uuid associated');
        totalFailed++;
      }
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
      for (const event of pixelEvents) {
        await markFailed(event, 'Pixel not found or inactive');
        totalFailed++;
      }
      continue;
    }

    // 4. Send batch to Meta CAPI
    try {
      for (const event of pixelEvents) {
        const capiPayload = formatForCapi(event);
        await supabaseAdmin
          .from('events')
          .update({ payload_capi: capiPayload })
          .eq('event_id', event.event_id);
      }

      const fbSendStart = Date.now();
      const result = await sendToMetaCapi(pixelEvents, pixel as Pixel);
      const fbApiLatencyMs = Date.now() - fbSendStart;

      const enrichedResponse = {
        ...result.response,
        fb_api_latency_ms: fbApiLatencyMs,
      };

      if (result.success) {
        const sentAt = new Date().toISOString();
        for (const event of pixelEvents) {
          await supabaseAdmin
            .from('events')
            .update({
              status: 'sent',
              sent_at: sentAt,
              meta_response: enrichedResponse,
            })
            .eq('event_id', event.event_id);
          totalSent++;
        }
      } else {
        for (const event of pixelEvents) {
          await handleFailure(event, enrichedResponse, result.statusCode);
          totalFailed++;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      for (const event of pixelEvents) {
        await handleFailure(event, { error: { message: errorMsg } }, 0);
        totalFailed++;
      }
    }
  }

  return { processed: events.length, sent: totalSent, failed: totalFailed };
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

async function handleFailure(
  event: Event,
  response: Record<string, any>,
  statusCode: number
) {
  const errorMsg =
    (response.error as any)?.message ||
    JSON.stringify(response).substring(0, 500);

  await markFailed(event, `[${statusCode}] ${errorMsg}`);

  await supabaseAdmin
    .from('events')
    .update({ meta_response: response })
    .eq('event_id', event.event_id);
}

function categorizeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('auth') || lower.includes('token') || lower.includes('permission')) {
    return 'auth_error';
  }
  if (lower.includes('rate') || lower.includes('limit') || lower.includes('throttl')) {
    return 'rate_limit';
  }
  if (lower.includes('payload') || lower.includes('invalid') || lower.includes('required')) {
    return 'payload_error';
  }
  return 'unknown';
}
