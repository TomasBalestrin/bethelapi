-- ============================================
-- BETHEL GTM SaaS — Database Schema v2
-- ============================================

-- 1. ENUMS
-- ============================================

CREATE TYPE event_status AS ENUM (
  'received',
  'queued',
  'processing',
  'sent',
  'failed',
  'dlq',
  'skipped'
);

CREATE TYPE event_source AS ENUM (
  'client',
  'server',
  'checkout_webhook'
);

-- 2. TABLES
-- ============================================

-- pixels — Multi-tenant (multiple Meta pixels)
CREATE TABLE pixels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  pixel_id        TEXT NOT NULL UNIQUE,
  access_token    TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- sites — Client sites linked to a pixel
CREATE TABLE sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pixel_uuid      UUID NOT NULL REFERENCES pixels(id) ON DELETE CASCADE,
  domain          TEXT NOT NULL UNIQUE,
  ingest_token    TEXT NOT NULL UNIQUE,
  is_active       BOOLEAN DEFAULT true,
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- events — Main event queue
CREATE TABLE events (
  id                  BIGSERIAL PRIMARY KEY,
  event_id            UUID NOT NULL UNIQUE,
  site_id             UUID REFERENCES sites(id) ON DELETE SET NULL,
  pixel_uuid          UUID REFERENCES pixels(id) ON DELETE SET NULL,
  event_name          TEXT NOT NULL,
  source_type         event_source NOT NULL DEFAULT 'client',
  status              event_status NOT NULL DEFAULT 'queued',
  retries             INT DEFAULT 0,
  next_retry_at       TIMESTAMPTZ,
  consent             BOOLEAN DEFAULT true,
  consent_categories  TEXT[],
  payload_raw         JSONB NOT NULL,
  payload_enriched    JSONB,
  payload_capi        JSONB,
  meta_response       JSONB,
  error_message       TEXT,
  ip_hash             TEXT,
  hold_for_webhook    BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  queued_at           TIMESTAMPTZ,
  processing_at       TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- dlq_events — Dead Letter Queue
CREATE TABLE dlq_events (
  id              BIGSERIAL PRIMARY KEY,
  event_id        UUID NOT NULL,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  pixel_uuid      UUID REFERENCES pixels(id) ON DELETE SET NULL,
  event_name      TEXT NOT NULL,
  payload_raw     JSONB NOT NULL,
  payload_capi    JSONB,
  error_message   TEXT,
  retries         INT NOT NULL,
  failure_reason  TEXT,
  moved_at        TIMESTAMPTZ DEFAULT now(),
  reprocessed_at  TIMESTAMPTZ
);

-- event_logs — Audit log for every action
CREATE TABLE event_logs (
  id              BIGSERIAL PRIMARY KEY,
  event_id        UUID NOT NULL,
  action          TEXT NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- daily_stats — Aggregated metrics (materialized by cron)
CREATE TABLE daily_stats (
  id                BIGSERIAL PRIMARY KEY,
  date              DATE NOT NULL,
  site_id           UUID REFERENCES sites(id) ON DELETE SET NULL,
  pixel_uuid        UUID REFERENCES pixels(id) ON DELETE SET NULL,
  event_name        TEXT NOT NULL,
  total_received    INT DEFAULT 0,
  total_sent        INT DEFAULT 0,
  total_failed      INT DEFAULT 0,
  total_dlq         INT DEFAULT 0,
  total_duplicates  INT DEFAULT 0,
  avg_latency_ms    FLOAT,
  UNIQUE(date, site_id, event_name)
);

-- 3. INDEXES
-- ============================================

CREATE INDEX idx_events_queue ON events (status, next_retry_at)
  WHERE status IN ('queued', 'failed');

CREATE INDEX idx_events_site_date ON events (site_id, created_at DESC);

CREATE INDEX idx_events_event_name ON events (event_name);

CREATE INDEX idx_dlq_site ON dlq_events (site_id, moved_at DESC);

CREATE INDEX idx_dlq_reprocess ON dlq_events (reprocessed_at)
  WHERE reprocessed_at IS NULL;

CREATE INDEX idx_logs_event ON event_logs (event_id, created_at);

CREATE INDEX idx_stats_lookup ON daily_stats (date, site_id, event_name);

-- 4. TRIGGERS — updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pixels_updated_at
  BEFORE UPDATE ON pixels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. TRIGGER — Audit log on events insert/update
-- ============================================

CREATE OR REPLACE FUNCTION event_audit_log_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO event_logs (event_id, action, details)
    VALUES (NEW.event_id, 'received', jsonb_build_object(
      'event_name', NEW.event_name,
      'source_type', NEW.source_type::text,
      'status', NEW.status::text
    ));
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO event_logs (event_id, action, details)
    VALUES (NEW.event_id,
      CASE NEW.status
        WHEN 'queued' THEN 'queued'
        WHEN 'processing' THEN 'processing'
        WHEN 'sent' THEN 'sent'
        WHEN 'failed' THEN 'failed'
        WHEN 'dlq' THEN 'dlq'
        WHEN 'skipped' THEN 'skipped'
        ELSE 'status_change'
      END,
      jsonb_build_object(
        'old_status', OLD.status::text,
        'new_status', NEW.status::text,
        'retries', NEW.retries,
        'error_message', NEW.error_message
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_audit_log
  AFTER INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION event_audit_log_fn();

-- 6. FUNCTIONS
-- ============================================

-- claim_events — Grab batch from queue with SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_events(
  p_batch_size INT,
  p_pixel_uuid UUID DEFAULT NULL
)
RETURNS SETOF events AS $$
BEGIN
  RETURN QUERY
  UPDATE events SET
    status = 'processing',
    processing_at = now()
  WHERE id IN (
    SELECT id FROM events
    WHERE status IN ('queued', 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND (hold_for_webhook = false)
      AND (p_pixel_uuid IS NULL OR pixel_uuid = p_pixel_uuid)
      AND consent = true
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- move_to_dlq — Move event to Dead Letter Queue
CREATE OR REPLACE FUNCTION move_to_dlq(
  p_event_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO dlq_events (event_id, site_id, pixel_uuid, event_name, payload_raw, payload_capi, error_message, retries, failure_reason)
  SELECT event_id, site_id, pixel_uuid, event_name, payload_raw, payload_capi, error_message, retries, p_reason
  FROM events WHERE event_id = p_event_id;

  DELETE FROM events WHERE event_id = p_event_id;

  INSERT INTO event_logs (event_id, action, details)
  VALUES (p_event_id, 'dlq', jsonb_build_object('reason', p_reason));
END;
$$ LANGUAGE plpgsql;

-- reprocess_from_dlq — Re-insert into queue from DLQ
CREATE OR REPLACE FUNCTION reprocess_from_dlq(
  p_event_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_dlq dlq_events%ROWTYPE;
BEGIN
  SELECT * INTO v_dlq FROM dlq_events WHERE event_id = p_event_id AND reprocessed_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO events (event_id, site_id, pixel_uuid, event_name, source_type, status, retries, payload_raw, payload_capi, queued_at)
  VALUES (v_dlq.event_id, v_dlq.site_id, v_dlq.pixel_uuid, v_dlq.event_name, 'client', 'queued', 0, v_dlq.payload_raw, v_dlq.payload_capi, now());

  UPDATE dlq_events SET reprocessed_at = now() WHERE event_id = p_event_id;

  INSERT INTO event_logs (event_id, action, details)
  VALUES (p_event_id, 'reprocessed', jsonb_build_object('from', 'dlq'));

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- aggregate_daily_stats — Called by daily cron
CREATE OR REPLACE FUNCTION aggregate_daily_stats(
  p_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_stats (date, site_id, pixel_uuid, event_name, total_received, total_sent, total_failed, total_dlq, avg_latency_ms)
  SELECT
    p_date,
    site_id,
    pixel_uuid,
    event_name,
    COUNT(*) FILTER (WHERE status != 'skipped') as total_received,
    COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
    COUNT(*) FILTER (WHERE status = 'failed' OR status = 'dlq') as total_failed,
    COUNT(*) FILTER (WHERE status = 'dlq') as total_dlq,
    AVG(EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000) FILTER (WHERE sent_at IS NOT NULL) as avg_latency_ms
  FROM events
  WHERE created_at::date = p_date
  GROUP BY site_id, pixel_uuid, event_name
  ON CONFLICT (date, site_id, event_name) DO UPDATE SET
    total_received = EXCLUDED.total_received,
    total_sent = EXCLUDED.total_sent,
    total_failed = EXCLUDED.total_failed,
    total_dlq = EXCLUDED.total_dlq,
    avg_latency_ms = EXCLUDED.avg_latency_ms;
END;
$$ LANGUAGE plpgsql;

-- purge_old_events — Automatic cleanup
CREATE OR REPLACE FUNCTION purge_old_events(
  p_days INT DEFAULT 90
)
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM event_logs
  WHERE created_at < now() - (p_days || ' days')::interval
    AND event_id IN (
      SELECT event_id FROM events WHERE status = 'sent' AND sent_at < now() - (p_days || ' days')::interval
    );

  DELETE FROM events
  WHERE status = 'sent'
    AND sent_at < now() - (p_days || ' days')::interval;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- get_dashboard_stats — Stats for admin dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_site_id UUID DEFAULT NULL,
  p_hours INT DEFAULT 24
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_events', (
      SELECT COUNT(*) FROM events
      WHERE created_at > now() - (p_hours || ' hours')::interval
        AND (p_site_id IS NULL OR site_id = p_site_id)
    ),
    'by_status', (
      SELECT COALESCE(json_object_agg(status, cnt), '{}')
      FROM (
        SELECT status::text, COUNT(*) as cnt FROM events
        WHERE created_at > now() - (p_hours || ' hours')::interval
          AND (p_site_id IS NULL OR site_id = p_site_id)
        GROUP BY status
      ) s
    ),
    'by_event_name', (
      SELECT COALESCE(json_object_agg(event_name, cnt), '{}')
      FROM (
        SELECT event_name, COUNT(*) as cnt FROM events
        WHERE created_at > now() - (p_hours || ' hours')::interval
          AND (p_site_id IS NULL OR site_id = p_site_id)
        GROUP BY event_name
      ) e
    ),
    'avg_latency_ms', (
      SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000)::numeric, 1), 0)
      FROM events
      WHERE sent_at IS NOT NULL
        AND created_at > now() - (p_hours || ' hours')::interval
        AND (p_site_id IS NULL OR site_id = p_site_id)
    ),
    'dlq_count', (
      SELECT COUNT(*) FROM dlq_events
      WHERE moved_at > now() - (p_hours || ' hours')::interval
        AND (p_site_id IS NULL OR site_id = p_site_id)
        AND reprocessed_at IS NULL
    ),
    'success_rate', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 100.0
        ELSE ROUND(COUNT(*) FILTER (WHERE status = 'sent')::numeric / COUNT(*)::numeric * 100, 1)
      END
      FROM events
      WHERE created_at > now() - (p_hours || ' hours')::interval
        AND (p_site_id IS NULL OR site_id = p_site_id)
        AND status NOT IN ('skipped', 'queued', 'processing')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 7. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlq_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- service_role only policies
CREATE POLICY "service_role_only" ON pixels FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON sites FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON dlq_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON event_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_only" ON daily_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
