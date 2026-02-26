-- ============================================
-- Add pixel_uuid filter to get_dashboard_stats
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_site_id UUID DEFAULT NULL,
  p_hours INT DEFAULT 24,
  p_pixel_uuid UUID DEFAULT NULL
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
        AND (p_pixel_uuid IS NULL OR pixel_uuid = p_pixel_uuid)
    ),
    'by_status', (
      SELECT COALESCE(json_object_agg(status, cnt), '{}')
      FROM (
        SELECT status::text, COUNT(*) as cnt FROM events
        WHERE created_at > now() - (p_hours || ' hours')::interval
          AND (p_site_id IS NULL OR site_id = p_site_id)
          AND (p_pixel_uuid IS NULL OR pixel_uuid = p_pixel_uuid)
        GROUP BY status
      ) s
    ),
    'by_event_name', (
      SELECT COALESCE(json_object_agg(event_name, cnt), '{}')
      FROM (
        SELECT event_name, COUNT(*) as cnt FROM events
        WHERE created_at > now() - (p_hours || ' hours')::interval
          AND (p_site_id IS NULL OR site_id = p_site_id)
          AND (p_pixel_uuid IS NULL OR pixel_uuid = p_pixel_uuid)
        GROUP BY event_name
      ) e
    ),
    'avg_latency_ms', (
      SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000)::numeric, 1), 0)
      FROM events
      WHERE sent_at IS NOT NULL
        AND created_at > now() - (p_hours || ' hours')::interval
        AND (p_site_id IS NULL OR site_id = p_site_id)
        AND (p_pixel_uuid IS NULL OR pixel_uuid = p_pixel_uuid)
    ),
    'dlq_count', (
      SELECT COUNT(*) FROM dlq_events
      WHERE moved_at > now() - (p_hours || ' hours')::interval
        AND (p_site_id IS NULL OR site_id = p_site_id)
        AND (p_pixel_uuid IS NULL OR pixel_uuid = p_pixel_uuid)
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
        AND (p_pixel_uuid IS NULL OR pixel_uuid = p_pixel_uuid)
        AND status NOT IN ('skipped', 'queued', 'processing')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
