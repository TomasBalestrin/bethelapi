import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth';
import { processEventQueue } from '@/lib/dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!validateCronAuth(req)) {
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
