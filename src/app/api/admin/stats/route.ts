import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const site_id = params.get('site_id') || undefined;
  const pixel_uuid = params.get('pixel_uuid') || undefined;
  const hours = parseInt(params.get('hours') || '24', 10);

  const defaultStats = {
    total_events: 0,
    by_status: {},
    by_event_name: {},
    avg_latency_ms: 0,
    dlq_count: 0,
    success_rate: 100,
  };

  // Fetch stats from RPC — fall back to defaults if the function is missing or errors
  let statsData = defaultStats;
  try {
    const { data, error } = await supabaseAdmin.rpc('get_dashboard_stats', {
      p_site_id: site_id || null,
      p_hours: hours,
      p_pixel_uuid: pixel_uuid || null,
    });

    if (error) {
      console.error('Stats RPC error (using defaults):', error.message);
    } else if (data) {
      statsData = data;
    }
  } catch (err) {
    console.error('Stats RPC exception (using defaults):', err);
  }

  // Fetch recent events timeline (events per hour)
  const hourlyBuckets: Record<string, { total: number; sent: number; failed: number }> = {};
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    let timelineQuery = supabaseAdmin
      .from('events')
      .select('created_at, status, event_name')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (site_id) {
      timelineQuery = timelineQuery.eq('site_id', site_id);
    }

    if (pixel_uuid) {
      timelineQuery = timelineQuery.eq('pixel_uuid', pixel_uuid);
    }

    const { data: timeline } = await timelineQuery;

    if (timeline) {
      for (const event of timeline) {
        const hour = new Date(event.created_at).toISOString().substring(0, 13);
        if (!hourlyBuckets[hour]) {
          hourlyBuckets[hour] = { total: 0, sent: 0, failed: 0 };
        }
        hourlyBuckets[hour].total++;
        if (event.status === 'sent') hourlyBuckets[hour].sent++;
        if (event.status === 'failed' || event.status === 'dlq') hourlyBuckets[hour].failed++;
      }
    }
  } catch (err) {
    console.error('Timeline query error:', err);
  }

  return NextResponse.json({
    ...statsData,
    events_per_hour: hourlyBuckets,
  });
}
