-- ============================================
-- Add webhook_secret to pixels table
-- ============================================

ALTER TABLE pixels ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Backfill existing pixels with generated secrets
UPDATE pixels SET webhook_secret = gen_random_uuid()::text WHERE webhook_secret IS NULL;
