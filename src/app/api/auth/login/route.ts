import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// POST — Provision user with auto-confirmed email (requires service role key)
export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json({ ok: true, provisioned: false, reason: 'missing_config' });
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    const supabaseAdmin = createClient(url, serviceKey);

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error('List users error:', listError);
      return NextResponse.json({ ok: true, provisioned: false, reason: 'list_error' });
    }

    const userExists = existingUsers?.users?.some((u) => u.email === email);

    if (userExists) {
      return NextResponse.json({ ok: true, provisioned: true });
    }

    // Create user with email auto-confirmed (bypasses email verification)
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error('Create user error:', createError);
      return NextResponse.json({ ok: true, provisioned: false, reason: 'create_error' });
    }

    return NextResponse.json({ ok: true, provisioned: true });
  } catch (err) {
    console.error('Login provision error:', err);
    return NextResponse.json({ ok: true, provisioned: false, reason: 'exception' });
  }
}
