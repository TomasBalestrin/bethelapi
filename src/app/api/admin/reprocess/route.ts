import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!validateAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const eventId = body.event_id;

    if (!eventId) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('reprocess_from_dlq', {
      p_event_id: eventId,
    });

    if (error) {
      console.error('Reprocess error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Event not found in DLQ or already reprocessed' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, event_id: eventId, reprocessed: true });
  } catch (err) {
    console.error('Reprocess error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
