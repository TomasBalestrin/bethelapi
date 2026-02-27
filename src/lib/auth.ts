import { createHmac } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';

// Validate ingest token against sites table
export async function validateIngestToken(
  token: string,
  origin: string | null
): Promise<{ valid: boolean; site_id?: string; pixel_uuid?: string; error?: string }> {
  const { data: site, error } = await supabaseAdmin
    .from('sites')
    .select('id, pixel_uuid, domain, is_active')
    .eq('ingest_token', token)
    .single();

  if (error || !site) {
    return { valid: false, error: 'Invalid token' };
  }

  if (!site.is_active) {
    return { valid: false, error: 'Site is inactive' };
  }

  // Validate origin if present
  if (origin) {
    const originHost = new URL(origin).hostname;
    if (originHost !== site.domain && !originHost.endsWith(`.${site.domain}`)) {
      return { valid: false, error: 'Origin mismatch' };
    }
  }

  return { valid: true, site_id: site.id, pixel_uuid: site.pixel_uuid };
}

// Validate admin auth: supports both admin_secret header and Supabase session cookies
export async function validateAdminAuth(req: NextRequest): Promise<boolean> {
  // 1. Check admin secret (for programmatic access)
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    const headerSecret = req.headers.get('x-admin-secret');
    if (headerSecret === secret) return true;
  }

  // 2. Check Supabase session (for browser access via cookies)
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {
            // Route handlers can't set cookies during validation
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

// Validate cron secret (Vercel)
export function validateCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authorization = req.headers.get('authorization');
  return authorization === `Bearer ${secret}`;
}

// Validate webhook HMAC signature
export function validateWebhookSignature(
  body: string,
  signature: string | null
): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
}

// Extract client IP from request
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}
