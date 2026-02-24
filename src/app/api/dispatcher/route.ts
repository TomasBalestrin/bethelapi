import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendToMetaCapi, getRetryDelay, MAX_RETRIES, BATCH_SIZE, formatForCapi } from '@/lib/meta-capi';
import { validateCronAuth } from '@/lib/auth';
import type { Event, Pixel } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60s for Vercel

export async function GET(req: NextRequest) {
  // Validate cron auth
  if (!validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Claim batch of events using SKIP LOCKED function
    const { data: events, error: claimError } = await supabaseAdmin.rpc('claim_events', {
      p_batch_size: BATCH_SIZE,
    });

    if (claimError) {
      console.error('Claim events error:', claimError);
      return NextResponse.json({ error: 'Failed to claim events' }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No events to process' });
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
        // Mark as failed — no pixel
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
        // Prepare CAPI payloads
        for (const event of pixelEvents) {
          const capiPayload = formatForCapi(event);
          await supabaseAdmin
            .from('events')
            .update({ payload_capi: capiPayload })
            .eq('event_id', event.event_id);
        }

        const result = await sendToMetaCapi(pixelEvents, pixel as Pixel);

        if (result.success) {
          // Mark all as sent
          for (const event of pixelEvents) {
            await supabaseAdmin
              .from('events')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                meta_response: result.response,
              })
              .eq('event_id', event.event_id);
            totalSent++;
          }
        } else {
          // Handle failure
          for (const event of pixelEvents) {
            await handleFailure(event, result.response, result.statusCode);
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

    return NextResponse.json({
      success: true,
      processed: events.length,
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (err) {
    console.error('Dispatcher error:', err);
    return NextResponse.json({ error: 'Dispatcher failed' }, { status: 500 });
  }
}

async function markFailed(event: Event, errorMessage: string) {
  const newRetries = event.retries + 1;

  if (newRetries >= MAX_RETRIES) {
    // Move to DLQ
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
