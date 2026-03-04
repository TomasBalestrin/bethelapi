import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — Truncate all data tables (keeps schema, functions, triggers, and auth users)
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Delete in order respecting foreign key constraints:
    // 1. event_logs (no FK constraints from other tables)
    // 2. daily_stats (FK to sites, pixels)
    // 3. dlq_events (FK to sites, pixels)
    // 4. events (FK to sites, pixels)
    // 5. sites (FK to pixels)
    // 6. pixels

    const tables = [
      'event_logs',
      'daily_stats',
      'dlq_events',
      'events',
      'sites',
      'pixels',
    ];

    const results: Record<string, string> = {};

    for (const table of tables) {
      const { error } = await supabaseAdmin.from(table).delete().gte('id', 0);
      if (error) {
        results[table] = `error: ${error.message}`;
      } else {
        results[table] = 'cleared';
      }
    }

    return NextResponse.json({
      success: true,
      message: 'All data tables cleared. Auth users and schema preserved.',
      tables: results,
    });
  } catch (err) {
    console.error('Reset error:', err);
    return NextResponse.json({ error: 'Failed to reset data' }, { status: 500 });
  }
}
