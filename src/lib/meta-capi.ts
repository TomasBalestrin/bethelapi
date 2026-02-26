import type { Event, Pixel } from '@/types/database';

interface MetaEventData {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url?: string;
  action_source: 'website';
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}

interface MetaBatchPayload {
  data: MetaEventData[];
}

interface MetaResponse {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

// Validate a Meta Pixel access token by making a test call to the Graph API
export async function validateMetaToken(
  pixelId: string,
  accessToken: string
): Promise<{ valid: boolean; pixelName?: string; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (data.error) {
      return {
        valid: false,
        error: data.error.message || 'Token inválido ou sem permissão para este pixel.',
      };
    }

    if (data.id) {
      return { valid: true, pixelName: data.name || undefined };
    }

    return { valid: false, error: 'Resposta inesperada da Meta API.' };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Falha na conexão com a Meta API.',
    };
  }
}

// Send a test PageView event to Meta CAPI to validate the full pipeline
export async function sendTestEvent(
  pixelId: string,
  accessToken: string
): Promise<{ success: boolean; eventsReceived?: number; error?: string }> {
  const testEventId = `bethel_test_${Date.now()}`;
  const payload = {
    data: [
      {
        event_name: 'PageView',
        event_time: Math.floor(Date.now() / 1000),
        event_id: testEventId,
        event_source_url: 'https://test.bethel-gtm.com',
        action_source: 'website',
        user_data: {
          client_ip_address: '0.0.0.0',
          client_user_agent: 'BethelGTM/TestEvent',
        },
      },
    ],
    access_token: accessToken,
  };

  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const data: MetaResponse = await res.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return {
      success: true,
      eventsReceived: data.events_received ?? 1,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha na conexão com a Meta API.',
    };
  }
}

// Format a single event for Meta CAPI
export function formatForCapi(event: Event): MetaEventData {
  const enriched = (event.payload_enriched || event.payload_raw) as Record<string, unknown>;

  return {
    event_name: event.event_name,
    event_time: Math.floor(new Date(event.created_at).getTime() / 1000),
    event_id: event.event_id,
    event_source_url: enriched.source_url as string | undefined,
    action_source: 'website',
    user_data: (enriched.user_data as Record<string, unknown>) || {},
    custom_data: (enriched.custom_data as Record<string, unknown>) || undefined,
  };
}

// Send batch of events to Meta CAPI v19
export async function sendToMetaCapi(
  events: Event[],
  pixel: Pixel
): Promise<{ success: boolean; response: MetaResponse; statusCode: number }> {
  const payload: MetaBatchPayload = {
    data: events.map(formatForCapi),
  };

  const url = `https://graph.facebook.com/v19.0/${pixel.pixel_id}/events`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      access_token: pixel.access_token,
    }),
  });

  const response: MetaResponse = await res.json();

  return {
    success: res.ok && !response.error,
    response,
    statusCode: res.status,
  };
}

// Calculate next retry delay with exponential backoff
// Retry 1: +1min, Retry 2: +5min, Retry 3: +15min, Retry 4: +60min, Retry 5: DLQ
export function getRetryDelay(retryCount: number): number {
  const base = 60; // 60 seconds
  const maxDelay = 3600; // 1 hour
  return Math.min(base * Math.pow(2, retryCount), maxDelay);
}

export const MAX_RETRIES = 5;
export const BATCH_SIZE = 50;
