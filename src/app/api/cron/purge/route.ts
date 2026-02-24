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
    const { data, error } = await supabaseAdmin.rpc('purge_old_events', {
      p_days: 90,
    });

    if (error) {
      console.error('Purge error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Purged ${data} old events (>90 days)`,
      deleted: data,
    });
  } catch (err) {
    console.error('Purge error:', err);
    return NextResponse.json({ error: 'Failed to purge old events' }, { status: 500 });
  }
}
