import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  // Check Supabase
  const supaStart = Date.now();
  try {
    const { error } = await supabaseAdmin.from('pixels').select('id').limit(1);
    checks.supabase = {
      status: error ? 'unhealthy' : 'healthy',
      latency_ms: Date.now() - supaStart,
      error: error?.message,
    };
  } catch (err) {
    checks.supabase = {
      status: 'unhealthy',
      latency_ms: Date.now() - supaStart,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // Check Meta CAPI reachability
  const metaStart = Date.now();
  try {
    const res = await fetch('https://graph.facebook.com/v19.0/', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    checks.meta_capi = {
      status: res.ok ? 'healthy' : 'degraded',
      latency_ms: Date.now() - metaStart,
    };
  } catch (err) {
    checks.meta_capi = {
      status: 'unhealthy',
      latency_ms: Date.now() - metaStart,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // Queue stats
  try {
    const { count: queuedCount } = await supabaseAdmin
      .from('events')
      .select('*', { count: 'exact', head: true })
      .in('status', ['queued', 'failed']);

    const { count: dlqCount } = await supabaseAdmin
      .from('dlq_events')
      .select('*', { count: 'exact', head: true })
      .is('reprocessed_at', null);

    checks.queue = {
      status: 'healthy',
    };
    (checks.queue as any).queued_events = queuedCount || 0;
    (checks.queue as any).dlq_events = dlqCount || 0;
  } catch {
    checks.queue = { status: 'unknown' };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
