import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth, validateCronAuth } from '@/lib/auth';
import { processEventQueue } from '@/lib/dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Manual trigger — accepts both admin secret and cron secret
export async function GET(req: NextRequest) {
  if (!validateAdminAuth(req) && !validateCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processEventQueue();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Dispatcher error:', err);
    return NextResponse.json({ error: 'Dispatcher failed' }, { status: 500 });
  }
}
