import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PagTrustWebhookSchema } from '@/lib/pagtrust/schema';
import { mapPagTrustToEvent } from '@/lib/pagtrust/mapper';
import { reconcileWithClientEvent } from '@/lib/pagtrust/reconcile';
import { processEventQueue } from '@/lib/dispatcher';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const body = await req.json();

    // 1. Quick filter: only process PURCHASE_APPROVED
    if (body.event !== 'PURCHASE_APPROVED') {
      return NextResponse.json({ success: true, action: 'ignored' });
    }

    // 2. Validate payload with Zod
    const parsed = PagTrustWebhookSchema.safeParse(body);
    if (!parsed.success) {
      console.warn('PagTrust webhook: invalid payload', parsed.error.issues);
      return NextResponse.json({ success: true, action: 'ignored' });
    }

    const payload = parsed.data;

    // 3. Only process APPROVED status
    if (payload.data.purchase.status !== 'APPROVED') {
      return NextResponse.json({ success: true, action: 'ignored' });
    }

    // 4. Verify site exists and is active
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, pixel_uuid, is_active')
      .eq('id', siteId)
      .single();

    if (!site || !site.is_active) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // 5. Verify pixel is active and get pagtrust_hottok
    const { data: pixel } = await supabaseAdmin
      .from('pixels')
      .select('id, is_active, pagtrust_hottok')
      .eq('id', site.pixel_uuid)
      .single();

    if (!pixel || !pixel.is_active) {
      return NextResponse.json({ error: 'Pixel not found or inactive' }, { status: 404 });
    }

    // 6. Validate PagTrust hottok
    if (pixel.pagtrust_hottok) {
      if (!payload.hottok || payload.hottok !== pixel.pagtrust_hottok) {
        return NextResponse.json({ success: true, action: 'unauthorized' });
      }
    }

    const transaction = payload.data.purchase.transaction;

    // 7. Deduplication: check if this transaction was already processed via webhook
    const { data: duplicate } = await supabaseAdmin
      .from('events')
      .select('event_id')
      .eq('source_type', 'checkout_webhook')
      .eq('event_name', 'Purchase')
      .eq('site_id', site.id)
      .filter('payload_enriched->custom_data->>order_id', 'eq', transaction)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json({
        success: true,
        action: 'duplicate_skipped',
        event_id: duplicate.event_id,
      });
    }

    // 8. Reconciliation: look for held client Purchase event
    const heldEvent = await reconcileWithClientEvent(supabaseAdmin, site.id, transaction);

    if (heldEvent) {
      // Merge webhook data into existing event (webhook is source of truth)
      const mapped = mapPagTrustToEvent(payload, site.id, site.pixel_uuid);
      const existingEnriched = (heldEvent.payload_enriched || heldEvent.payload_raw) as Record<string, Record<string, unknown>>;

      const mergedEnriched = {
        ...existingEnriched,
        user_data: {
          ...(existingEnriched.user_data || {}),
          ...mapped.payload_enriched.user_data, // webhook wins
        },
        custom_data: {
          ...(existingEnriched.custom_data || {}),
          ...mapped.payload_enriched.custom_data, // webhook wins for value/currency
        },
      };

      await supabaseAdmin
        .from('events')
        .update({
          source_type: 'checkout_webhook',
          hold_for_webhook: false,
          status: 'queued',
          payload_enriched: mergedEnriched,
        })
        .eq('event_id', heldEvent.event_id);

      // Fire-and-forget dispatch
      processEventQueue().catch((err) =>
        console.error('PagTrust dispatch error (reconcile):', err)
      );

      return NextResponse.json({
        success: true,
        action: 'reconciled',
        event_id: heldEvent.event_id,
      });
    }

    // 9. No matching client event — create new server-side event
    const newEvent = mapPagTrustToEvent(payload, site.id, site.pixel_uuid);

    const { error } = await supabaseAdmin.from('events').insert(newEvent);

    if (error) {
      console.error('PagTrust insert error:', error);
      return NextResponse.json({ success: true, error: 'insert_failed' });
    }

    // Fire-and-forget dispatch
    processEventQueue().catch((err) =>
      console.error('PagTrust dispatch error (create):', err)
    );

    return NextResponse.json({
      success: true,
      action: 'created',
      event_id: newEvent.event_id,
    });
  } catch (err) {
    console.error('PagTrust webhook error:', err);
    // Always return 200 — PagTrust has short timeout and retries on non-200
    return NextResponse.json({ success: true });
  }
}
