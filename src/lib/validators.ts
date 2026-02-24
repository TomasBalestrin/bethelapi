import { z } from 'zod';

// Ingest event payload from client SDK
export const IngestEventSchema = z.object({
  event_name: z.string().min(1).max(100),
  event_id: z.string().uuid().optional(),
  event_time: z.number().optional(),
  source_url: z.string().url().optional(),
  user_data: z
    .object({
      em: z.string().optional(),        // email (raw or pre-hashed)
      ph: z.string().optional(),        // phone
      fn: z.string().optional(),        // first name
      ln: z.string().optional(),        // last name
      ct: z.string().optional(),        // city
      st: z.string().optional(),        // state
      zp: z.string().optional(),        // zip
      country: z.string().optional(),
      external_id: z.string().optional(),
      fbp: z.string().optional(),       // _fbp cookie
      fbc: z.string().optional(),       // _fbc cookie
      client_ip_address: z.string().optional(),
      client_user_agent: z.string().optional(),
    })
    .optional(),
  custom_data: z.record(z.string(), z.unknown()).optional(),
  consent: z.boolean().optional().default(true),
  consent_categories: z.array(z.string()).optional(),
  order_id: z.string().optional(),      // for Purchase reconciliation
});

export type IngestEventPayload = z.infer<typeof IngestEventSchema>;

// Batch ingest (SDK sends batch of events)
export const IngestBatchSchema = z.object({
  events: z.array(IngestEventSchema).min(1).max(50),
});

export type IngestBatchPayload = z.infer<typeof IngestBatchSchema>;

// Webhook payload (e.g., from payment platform)
export const WebhookPayloadSchema = z.object({
  order_id: z.string().min(1),
  value: z.number().positive(),
  currency: z.string().length(3).default('BRL'),
  status: z.enum(['approved', 'refunded', 'cancelled', 'pending']),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        quantity: z.number().optional(),
        price: z.number().optional(),
      })
    )
    .optional(),
  customer: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// Admin pixel creation
export const CreatePixelSchema = z.object({
  name: z.string().min(1).max(255),
  pixel_id: z.string().min(1).max(50),
  access_token: z.string().min(1),
});

export type CreatePixelPayload = z.infer<typeof CreatePixelSchema>;

// Admin site creation
export const CreateSiteSchema = z.object({
  pixel_uuid: z.string().uuid(),
  domain: z.string().min(1).max(255),
});

export type CreateSitePayload = z.infer<typeof CreateSiteSchema>;
