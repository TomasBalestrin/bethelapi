import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Look for a held client-side Purchase event that matches this transaction.
 * Returns the event if found (within 30-minute window), null otherwise.
 */
export async function reconcileWithClientEvent(
  supabase: SupabaseClient,
  siteId: string,
  transaction: string
) {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('event_name', 'Purchase')
    .eq('site_id', siteId)
    .eq('hold_for_webhook', true)
    .filter('payload_raw->>order_id', 'eq', transaction)
    .gte('created_at', thirtyMinAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
