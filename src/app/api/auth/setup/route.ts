import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// POST — Create an admin user (protected by ADMIN_SECRET)
export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 });
  }

  const headerSecret = req.headers.get('x-admin-secret');
  if (headerSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUsers?.users?.some((u) => u.email === email);

    if (userExists) {
      return NextResponse.json({ message: 'User already exists', email });
    }

    // Create the user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      console.error('Create user error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
    }, { status: 201 });
  } catch (err) {
    console.error('Setup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
