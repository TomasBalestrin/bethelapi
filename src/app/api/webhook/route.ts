import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateWebhookSignature } from '@/lib/auth';
import { hashUserData } from '@/lib/hash';
import { WebhookPayloadSchema } from '@/lib/validators';
import { processEventQueue } from '@/lib/dispatcher';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate HMAC signature
    const rawBody = await req.text();
    const signature = req.headers.get('x-webhook-signature');

    if (!validateWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Parse and validate payload
    const body = JSON.parse(rawBody);
    const payload = WebhookPayloadSchema.parse(body);

    // 3. Only process approved purchases
    if (payload.status !== 'approved') {
      return NextResponse.json({
        success: true,
        action: 'ignored',
        reason: `Status '${payload.status}' does not trigger CAPI`,
      });
    }

    // 4. Try to find existing client-side Purchase event by order_id
    const { data: existingEvent } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('event_name', 'Purchase')
      .eq('hold_for_webhook', true)
      .filter('payload_raw->order_id', 'eq', payload.order_id)
      .single();

    if (existingEvent) {
      // Reconcile: update existing event with webhook data (source of truth)
      const hashedCustomer = payload.customer
        ? hashUserData({
            em: payload.customer.email,
            ph: payload.customer.phone,
            fn: payload.customer.name,
          })
        : {};

      const enrichedPayload = {
        ...(existingEvent.payload_enriched || existingEvent.payload_raw),
        user_data: {
          ...((existingEvent.payload_enriched as any)?.user_data || {}),
          ...hashedCustomer,
        },
        custom_data: {
          ...((existingEvent.payload_enriched as any)?.custom_data || {}),
          value: payload.value,
          currency: payload.currency,
          content_type: 'product',
          contents: payload.items || [],
          order_id: payload.order_id,
        },
      };

      await supabaseAdmin
        .from('events')
        .update({
          source_type: 'checkout_webhook',
          hold_for_webhook: false,
          status: 'queued',
          payload_enriched: enrichedPayload,
        })
        .eq('event_id', existingEvent.event_id);

      // Fire-and-forget: dispatch immediately
      processEventQueue().catch((err) =>
        console.error('Inline dispatch error (webhook reconcile):', err)
      );

      return NextResponse.json({
        success: true,
        action: 'reconciled',
        event_id: existingEvent.event_id,
      });
    }

    // 5. No matching client event — create new server-side event
    const { v4: uuidv4 } = await import('uuid');
    const eventId = uuidv4();

    const hashedCustomer = payload.customer
      ? hashUserData({
          em: payload.customer.email,
          ph: payload.customer.phone,
          fn: payload.customer.name,
        })
      : {};

    // Try to get site from referrer or default first active site
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, pixel_uuid')
      .eq('is_active', true)
      .limit(1)
      .single();

    const { error } = await supabaseAdmin.from('events').insert({
      event_id: eventId,
      site_id: site?.id || null,
      pixel_uuid: site?.pixel_uuid || null,
      event_name: 'Purchase',
      source_type: 'checkout_webhook',
      status: 'queued',
      consent: true,
      payload_raw: payload,
      payload_enriched: {
        event_name: 'Purchase',
        user_data: hashedCustomer,
        custom_data: {
          value: payload.value,
          currency: payload.currency,
          content_type: 'product',
          contents: payload.items || [],
          order_id: payload.order_id,
        },
      },
      queued_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Webhook insert error:', error);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }

    // Fire-and-forget: dispatch immediately
    processEventQueue().catch((err) =>
      console.error('Inline dispatch error (webhook create):', err)
    );

    return NextResponse.json({
      success: true,
      action: 'created',
      event_id: eventId,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid payload', details: (err as any).errors },
        { status: 400 }
      );
    }
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
