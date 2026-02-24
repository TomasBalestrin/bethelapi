import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth, validateCronAuth } from '@/lib/auth';

export const runtime = 'nodejs';

// Manual trigger — accepts both admin secret and cron secret
export async function GET(req: NextRequest) {
  if (!validateAdminAuth(req) && !validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error } = await supabaseAdmin.rpc('aggregate_daily_stats', {
      p_date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // yesterday
    });

    if (error) {
      console.error('Stats aggregation error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Daily stats aggregated',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Stats error:', err);
    return NextResponse.json({ error: 'Failed to aggregate stats' }, { status: 500 });
  }
}
