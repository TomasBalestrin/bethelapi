-- Add PagTrust hottok column for webhook authentication
ALTER TABLE pixels ADD COLUMN IF NOT EXISTS pagtrust_hottok TEXT;
