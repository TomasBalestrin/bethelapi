export type EventStatus =
  | 'received'
  | 'queued'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'dlq'
  | 'skipped';

export type EventSource = 'client' | 'server' | 'checkout_webhook';

export interface Pixel {
  id: string;
  name: string;
  pixel_id: string;
  access_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: string;
  pixel_uuid: string;
  domain: string;
  ingest_token: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: number;
  event_id: string;
  site_id: string | null;
  pixel_uuid: string | null;
  event_name: string;
  source_type: EventSource;
  status: EventStatus;
  retries: number;
  next_retry_at: string | null;
  consent: boolean;
  consent_categories: string[] | null;
  payload_raw: Record<string, unknown>;
  payload_enriched: Record<string, unknown> | null;
  payload_capi: Record<string, unknown> | null;
  meta_response: Record<string, unknown> | null;
  error_message: string | null;
  ip_hash: string | null;
  hold_for_webhook: boolean;
  created_at: string;
  queued_at: string | null;
  processing_at: string | null;
  sent_at: string | null;
  updated_at: string;
}

export interface DlqEvent {
  id: number;
  event_id: string;
  site_id: string | null;
  pixel_uuid: string | null;
  event_name: string;
  payload_raw: Record<string, unknown>;
  payload_capi: Record<string, unknown> | null;
  error_message: string | null;
  retries: number;
  failure_reason: string | null;
  moved_at: string;
  reprocessed_at: string | null;
}

export interface EventLog {
  id: number;
  event_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface DailyStat {
  id: number;
  date: string;
  site_id: string | null;
  pixel_uuid: string | null;
  event_name: string;
  total_received: number;
  total_sent: number;
  total_failed: number;
  total_dlq: number;
  total_duplicates: number;
  avg_latency_ms: number | null;
}

export interface DashboardStats {
  total_events: number;
  by_status: Record<string, number>;
  by_event_name: Record<string, number>;
  avg_latency_ms: number;
  dlq_count: number;
  success_rate: number;
}
