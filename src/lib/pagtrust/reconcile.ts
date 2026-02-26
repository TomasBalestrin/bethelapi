import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Look for a held client-side Purchase event that matches this transaction.
 * Returns the event if found (within 5-minute window), null otherwise.
 */
export async function reconcileWithClientEvent(
  supabase: SupabaseClient,
  siteId: string,
  transaction: string
) {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('event_name', 'Purchase')
    .eq('site_id', siteId)
    .eq('hold_for_webhook', true)
    .filter('payload_raw->>order_id', 'eq', transaction)
    .gte('created_at', fiveMinAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
