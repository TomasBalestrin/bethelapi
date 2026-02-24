import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

// Client-side (anon key, respects RLS) — lazy init to avoid build-time errors
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Server-side (service role, bypasses RLS) — lazy init to avoid build-time errors
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    _supabaseAdmin = createClient(url, key);
  }
  return _supabaseAdmin;
}

// Backwards-compatible exports (getters)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as any)[prop];
  },
});

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});
