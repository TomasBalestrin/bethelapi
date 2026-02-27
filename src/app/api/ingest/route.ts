import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { validateIngestToken, getClientIp } from '@/lib/auth';
import { hashUserData, hashIp } from '@/lib/hash';
import { IngestEventSchema, IngestBatchSchema } from '@/lib/validators';
import { processEventQueue } from '@/lib/dispatcher';
import { checkIngestRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate token
    const token = req.headers.get('x-gtm-token');
    if (!token) {
      return NextResponse.json({ error: 'Missing X-GTM-Token' }, { status: 401 });
    }

    const origin = req.headers.get('origin');
    const auth = await validateIngestToken(token, origin);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // 2. Rate limit check
    const clientIpForLimit = getClientIp(req);
    const rateLimited = checkIngestRateLimit(token, clientIpForLimit);
    if (rateLimited) {
      return NextResponse.json(
        { error: rateLimited.message },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimited.retryAfter) },
        }
      );
    }

    // 3. Parse body
    const body = await req.json();

    // Support both single event and batch
    const isBatch = Array.isArray(body.events);
    const events = isBatch
      ? IngestBatchSchema.parse(body).events
      : [IngestEventSchema.parse(body)];

    // 4. Get client info
    const clientIp = clientIpForLimit;
    const userAgent = req.headers.get('user-agent') || '';
    const ipHash = hashIp(clientIp);

    // 5. Process each event
    const rows = events.map((event) => {
      const eventId = event.event_id || uuidv4();

      // Hash PII in user_data
      const hashedUserData = hashUserData(
        (event.user_data as Record<string, unknown>) || {}
      );

      // Enrich with server-side data
      const enrichedPayload = {
        ...event,
        user_data: {
          ...hashedUserData,
          client_ip_address: ipHash,
          client_user_agent: userAgent,
        },
        source_url: event.source_url,
      };

      const isPurchase = event.event_name === 'Purchase' && !!event.order_id;

      return {
        event_id: eventId,
        site_id: auth.site_id,
        pixel_uuid: auth.pixel_uuid,
        event_name: event.event_name,
        source_type: 'client' as const,
        status: event.consent === false ? 'skipped' : 'queued',
        consent: event.consent ?? true,
        consent_categories: event.consent_categories || null,
        payload_raw: event,
        payload_enriched: enrichedPayload,
        ip_hash: ipHash,
        hold_for_webhook: isPurchase,
        queued_at: new Date().toISOString(),
      };
    });

    // 6. Insert into events table
    const { data, error } = await supabaseAdmin
      .from('events')
      .insert(rows)
      .select('event_id, status');

    if (error) {
      // Handle duplicate event_id
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Duplicate event_id', detail: error.message },
          { status: 409 }
        );
      }
      console.error('Ingest insert error:', error);
      return NextResponse.json({ error: 'Failed to persist events' }, { status: 500 });
    }

    // 7. Fire-and-forget: trigger dispatcher inline (don't await)
    processEventQueue().catch((err) =>
      console.error('Inline dispatch error:', err)
    );

    return NextResponse.json(
      {
        success: true,
        events_received: data?.length || 0,
        event_ids: data?.map((e) => e.event_id) || [],
      },
      { status: 202 }
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid payload', details: (err as any).errors },
        { status: 400 }
      );
    }
    console.error('Ingest error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-GTM-Token',
      'Access-Control-Max-Age': '86400',
    },
  });
}
