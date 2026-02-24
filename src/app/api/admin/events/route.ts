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

  // Query events table
  let query = supabaseAdmin
    .from('events')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (event_name) query = query.eq('event_name', event_name);
  if (site_id) query = query.eq('site_id', site_id);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
  });
}
