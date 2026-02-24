import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!validateAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all unreprocessed DLQ events
    const { data: dlqEvents, error: fetchError } = await supabaseAdmin
      .from('dlq_events')
      .select('event_id')
      .is('reprocessed_at', null)
      .limit(500);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!dlqEvents || dlqEvents.length === 0) {
      return NextResponse.json({ success: true, reprocessed: 0, message: 'No events in DLQ' });
    }

    let reprocessed = 0;
    let failed = 0;

    for (const dlqEvent of dlqEvents) {
      const { data, error } = await supabaseAdmin.rpc('reprocess_from_dlq', {
        p_event_id: dlqEvent.event_id,
      });

      if (error || !data) {
        failed++;
      } else {
        reprocessed++;
      }
    }

    return NextResponse.json({
      success: true,
      total: dlqEvents.length,
      reprocessed,
      failed,
    });
  } catch (err) {
    console.error('Reprocess all error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
