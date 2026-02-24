import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client-side (anon key, respects RLS)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey || 'placeholder');

// Server-side (service role, bypasses RLS)
// Falls back to anon key if service role not set (limited access)
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || supabaseAnonKey || 'placeholder'
);
