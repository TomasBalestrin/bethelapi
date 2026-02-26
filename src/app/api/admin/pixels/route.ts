import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { validateAdminAuth } from '@/lib/auth';
import { CreatePixelSchema, CreateSiteSchema } from '@/lib/validators';
import { validateMetaToken, sendTestEvent } from '@/lib/meta-capi';

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

// DELETE — Delete a pixel or a site
export async function DELETE(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, pixel_id, site_id } = body;

    if (type === 'site') {
      if (!site_id) {
        return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
      }
      const { error } = await supabaseAdmin
        .from('sites')
        .delete()
        .eq('id', site_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Default: delete pixel (cascade deletes sites)
    if (!pixel_id) {
      return NextResponse.json({ error: 'pixel_id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('pixels')
      .delete()
      .eq('id', pixel_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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

      // Validate Meta access token with a test call to the Graph API
      const validation = await validateMetaToken(payload.pixel_id, payload.access_token);
      if (!validation.valid) {
        return NextResponse.json(
          { error: `Token Meta inválido: ${validation.error}`, meta_validation: false },
          { status: 422 }
        );
      }

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

      return NextResponse.json(
        { success: true, data, meta_pixel_name: validation.pixelName },
        { status: 201 }
      );
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

    if (action === 'test_event') {
      const pixelUuid = body.pixel_uuid;
      if (!pixelUuid) {
        return NextResponse.json({ error: 'pixel_uuid is required' }, { status: 400 });
      }

      const { data: pixel, error: pixelError } = await supabaseAdmin
        .from('pixels')
        .select('pixel_id, access_token')
        .eq('id', pixelUuid)
        .single();

      if (pixelError || !pixel) {
        return NextResponse.json({ error: 'Pixel não encontrado' }, { status: 404 });
      }

      const result = await sendTestEvent(pixel.pixel_id, pixel.access_token);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Falha ao enviar evento teste', success: false },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        events_received: result.eventsReceived,
      });
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
