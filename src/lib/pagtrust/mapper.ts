import { v4 as uuidv4 } from 'uuid';
import { sha256, hashPhone, splitName, hashIfNeeded } from '@/lib/hash';
import type { PagTrustWebhook } from './schema';

export function mapPagTrustToEvent(
  payload: PagTrustWebhook,
  siteId: string,
  pixelUuid: string
) {
  const { buyer, product, purchase } = payload.data;
  const address = buyer.address;

  // Build hashed user_data — never store PII in clear text
  const user_data: Record<string, string | undefined> = {};

  if (buyer.email) {
    user_data.em = hashIfNeeded(buyer.email);
  }
  if (buyer.checkout_phone) {
    user_data.ph = hashPhone(buyer.checkout_phone);
  }
  if (buyer.name) {
    const { firstName, lastName } = splitName(buyer.name);
    if (firstName) user_data.fn = hashIfNeeded(firstName);
    if (lastName) user_data.ln = hashIfNeeded(lastName);
  }
  if (buyer.document) {
    user_data.external_id = sha256(buyer.document);
  }
  if (address?.city) {
    user_data.ct = hashIfNeeded(address.city);
  }
  if (address?.state) {
    user_data.st = hashIfNeeded(address.state.substring(0, 2));
  }
  if (address?.zipcode) {
    const digits = address.zipcode.replace(/\D/g, '');
    if (digits) user_data.zp = sha256(digits);
  }
  if (address?.country_iso) {
    user_data.country = hashIfNeeded(address.country_iso.toLowerCase());
  }

  // Build custom_data
  const custom_data = {
    value: purchase.full_price.value,
    currency: purchase.full_price.currency_value || 'BRL',
    order_id: purchase.transaction,
    content_name: product.name || undefined,
    content_ids: [product.id],
    content_type: 'product' as const,
  };

  // Use approved_date (ms → ISO) as created_at so dispatcher converts to correct event_time
  const createdAt = purchase.approved_date
    ? new Date(purchase.approved_date).toISOString()
    : new Date().toISOString();

  return {
    event_id: uuidv4(),
    site_id: siteId,
    pixel_uuid: pixelUuid,
    event_name: 'Purchase',
    source_type: 'checkout_webhook' as const,
    status: 'queued' as const,
    consent: true,
    hold_for_webhook: false,
    payload_raw: payload as unknown as Record<string, unknown>,
    payload_enriched: {
      user_data,
      custom_data,
    },
    created_at: createdAt,
    queued_at: new Date().toISOString(),
  };
}
