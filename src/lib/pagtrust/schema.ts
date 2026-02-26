import { z } from 'zod';

const AddressSchema = z.object({
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  complement: z.string().optional().default(''),
  country: z.string().optional().default(''),
  country_iso: z.string().optional().default(''),
  neighborhood: z.string().optional().default(''),
  number: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zipcode: z.string().optional().default(''),
});

const BuyerSchema = z.object({
  address: AddressSchema.optional(),
  checkout_phone: z.string().optional().default(''),
  document: z.string().optional().default(''),
  email: z.string().optional().default(''),
  name: z.string().optional().default(''),
});

const PriceSchema = z.object({
  currency_value: z.string().optional().default('BRL'),
  value: z.number(),
});

const OriginSchema = z.object({
  content: z.string().optional().default(''),
  sck: z.string().optional().default(''),
  src: z.string().optional().default(''),
  term: z.string().optional().default(''),
  utmcampaign: z.string().optional().default(''),
  utmmedium: z.string().optional().default(''),
  utmsource: z.string().optional().default(''),
});

const OfferSchema = z.object({
  code: z.string().optional().default(''),
});

const OrderBumpSchema = z.object({
  is_order_bump: z.boolean().optional().default(false),
  parent_purchase_transaction: z.union([z.string(), z.number()]).optional(),
});

const PurchaseSchema = z.object({
  approved_date: z.number(),
  checkout_country: z.object({
    iso: z.string().optional().default(''),
    name: z.string().optional().default(''),
  }).optional(),
  date_next_charge: z.string().optional().default(''),
  full_price: PriceSchema,
  offer: OfferSchema.optional(),
  order_bump: OrderBumpSchema.optional(),
  order_date: z.number().optional(),
  origin: OriginSchema.optional(),
  original_offer_price: PriceSchema.optional(),
  price: PriceSchema.optional(),
  status: z.string(),
  transaction: z.union([z.string(), z.number()]).transform(String),
});

const ProductSchema = z.object({
  has_co_production: z.boolean().optional().default(false),
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional().default(''),
});

const CommissionSchema = z.object({
  currency_value: z.string().optional(),
  source: z.string().optional(),
  value: z.number().optional(),
});

const ProducerSchema = z.object({
  name: z.string().optional().default(''),
});

export const PagTrustWebhookSchema = z.object({
  creation_date: z.number(),
  event: z.string(),
  data: z.object({
    buyer: BuyerSchema,
    commissions: z.array(CommissionSchema).optional().default([]),
    producer: ProducerSchema.optional(),
    product: ProductSchema,
    purchase: PurchaseSchema,
  }),
});

export type PagTrustWebhook = z.infer<typeof PagTrustWebhookSchema>;
