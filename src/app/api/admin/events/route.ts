import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const status = params.get('status');
  const event_name = params.get('event_name');
  const site_id = params.get('site_id');
  const from = params.get('from');
  const to = params.get('to');
  const page = parseInt(params.get('page') || '1', 10);
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 100);
  const source = params.get('source'); // 'events' or 'dlq'
  const offset = (page - 1) * limit;

  if (source === 'dlq') {
    // Query DLQ
    let query = supabaseAdmin
      .from('dlq_events')
      .select('*', { count: 'exact' })
      .order('moved_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (site_id) query = query.eq('site_id', site_id);
    if (event_name) query = query.eq('event_name', event_name);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data,
      pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
    });
  }

  const pixel_uuid = params.get('pixel_uuid');
  const hours = params.get('hours');

  // Build shared filter conditions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (status) q = q.eq('status', status);
    if (event_name) q = q.eq('event_name', event_name);
    if (site_id) q = q.eq('site_id', site_id);
    if (pixel_uuid) q = q.eq('pixel_uuid', pixel_uuid);
    if (hours) {
      const since = new Date(Date.now() - parseInt(hours, 10) * 60 * 60 * 1000).toISOString();
      q = q.gte('created_at', since);
    } else {
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);
    }
    return q;
  };

  // Query paginated events
  let query = supabaseAdmin
    .from('events')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  query = applyFilters(query);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute KPI metrics from a broader query (up to 5000 recent events with same filters)
  let kpis = null;
  try {
    let kpiQuery = supabaseAdmin
      .from('events')
      .select('status, created_at, sent_at, processing_at, meta_response')
      .order('created_at', { ascending: false })
      .limit(5000);

    kpiQuery = applyFilters(kpiQuery);

    const { data: kpiData } = await kpiQuery;

    if (kpiData && kpiData.length > 0) {
      const total = kpiData.length;
      const byStatus: Record<string, number> = {};
      let totalLatencyMs = 0;
      let latencyCount = 0;
      let fbConfirmed = 0;
      let fbRejected = 0;

      for (const ev of kpiData) {
        byStatus[ev.status] = (byStatus[ev.status] || 0) + 1;

        if (ev.sent_at && ev.created_at) {
          const latency = new Date(ev.sent_at).getTime() - new Date(ev.created_at).getTime();
          if (latency >= 0) {
            totalLatencyMs += latency;
            latencyCount++;
          }
        }

        if (ev.status === 'sent') {
          const meta = ev.meta_response as Record<string, unknown> | null;
          if (meta && typeof meta === 'object' && 'events_received' in meta && (meta.events_received as number) > 0) {
            fbConfirmed++;
          }
        }
        if (ev.status === 'failed' || ev.status === 'dlq') {
          const meta = ev.meta_response as Record<string, unknown> | null;
          if (meta && typeof meta === 'object' && 'error' in meta) {
            fbRejected++;
          }
        }
      }

      const sent = byStatus['sent'] || 0;
      const skipped = byStatus['skipped'] || 0;
      const pending = (byStatus['queued'] || 0) + (byStatus['processing'] || 0) + (byStatus['received'] || 0);
      const failed = (byStatus['failed'] || 0) + (byStatus['dlq'] || 0);

      // Pipeline total = everything that should be delivered (excludes skipped)
      const pipelineTotal = total - skipped;

      // Taxa de entrega = sent / pipeline total (includes pending in denominator)
      const deliveryRate = pipelineTotal > 0
        ? Math.round((sent / pipelineTotal) * 1000) / 10
        : 0;

      // Taxa de sucesso = sent / (sent + failed) — only completed events
      const completed = sent + failed;
      const successRate = completed > 0
        ? Math.round((sent / completed) * 1000) / 10
        : 0;

      // FB confirmation rate = fb_confirmed / sent
      const fbConfirmRate = sent > 0
        ? Math.round((fbConfirmed / sent) * 1000) / 10
        : 0;

      const avgLatencyMs = latencyCount > 0
        ? Math.round(totalLatencyMs / latencyCount)
        : 0;

      kpis = {
        total,
        by_status: byStatus,
        sent,
        pending,
        failed,
        skipped,
        delivery_rate: deliveryRate,
        success_rate: successRate,
        avg_latency_ms: avgLatencyMs,
        fb_confirmed: fbConfirmed,
        fb_rejected: fbRejected,
        fb_confirm_rate: fbConfirmRate,
      };
    }
  } catch (kpiErr) {
    console.error('KPI computation error:', kpiErr);
  }

  return NextResponse.json({
    data,
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
    kpis,
  });
}
