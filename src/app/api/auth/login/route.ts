import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// POST — Ensure user exists (with email auto-confirmed), then let client sign in
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      // Service role not configured — skip provisioning, let client handle it
      return NextResponse.json({ ok: true, provisioned: false });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error('List users error:', listError);
      // Don't block login — let client try on its own
      return NextResponse.json({ ok: true, provisioned: false });
    }

    const userExists = existingUsers?.users?.some((u) => u.email === email);

    if (userExists) {
      return NextResponse.json({ ok: true, provisioned: true });
    }

    // Create the user with email auto-confirmed (bypasses email verification)
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error('Create user error:', createError);
      // Don't block login — let client try signUp as fallback
      return NextResponse.json({ ok: true, provisioned: false });
    }

    return NextResponse.json({ ok: true, provisioned: true });
  } catch (err) {
    console.error('Login provision error:', err);
    // Never block login — always return ok so client can try
    return NextResponse.json({ ok: true, provisioned: false });
  }
}
