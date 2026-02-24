import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth } from '@/lib/auth';
import { CreatePixelSchema, CreateSiteSchema } from '@/lib/validators';

export const runtime = 'nodejs';

// GET — List all pixels with their sites
export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: pixels, error } = await supabaseAdmin
    .from('pixels')
    .select(`
      *,
      sites (*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: pixels });
}

// POST — Create new pixel or site
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action || 'create_pixel';

    if (action === 'create_pixel') {
      const payload = CreatePixelSchema.parse(body);

      const { data, error } = await supabaseAdmin
        .from('pixels')
        .insert({
          name: payload.name,
          pixel_id: payload.pixel_id,
          access_token: payload.access_token,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Pixel ID already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data }, { status: 201 });
    }

    if (action === 'create_site') {
      const payload = CreateSiteSchema.parse(body);

      // Generate a unique ingest token
      const ingestToken = `btl_${uuidv4().replace(/-/g, '')}`;

      const { data, error } = await supabaseAdmin
        .from('sites')
        .insert({
          pixel_uuid: payload.pixel_uuid,
          domain: payload.domain,
          ingest_token: ingestToken,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Domain already registered' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid payload', details: (err as any).errors },
        { status: 400 }
      );
    }
    console.error('Pixels error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
