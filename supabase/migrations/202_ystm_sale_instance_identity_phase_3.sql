-- Phase 3: sale-instance identity on ingested_sales (observability; no URL-uniqueness change yet).

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS source_listing_id text NULL,
  ADD COLUMN IF NOT EXISTS sale_instance_key text NULL,
  ADD COLUMN IF NOT EXISTS sale_instance_fingerprint text NULL,
  ADD COLUMN IF NOT EXISTS source_payload_hash text NULL,
  ADD COLUMN IF NOT EXISTS source_content_hash text NULL,
  ADD COLUMN IF NOT EXISTS source_schedule_hash text NULL,
  ADD COLUMN IF NOT EXISTS source_location_hash text NULL,
  ADD COLUMN IF NOT EXISTS source_url_first_seen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS source_url_last_seen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS supersedes_ingested_sale_id uuid NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_ingested_sale_id uuid NULL,
  ADD COLUMN IF NOT EXISTS superseded_sale_id uuid NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS superseded_reason text NULL;

CREATE INDEX IF NOT EXISTS ingested_sales_sale_instance_key_idx
  ON lootaura_v2.ingested_sales (source_platform, sale_instance_key)
  WHERE sale_instance_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingested_sales_source_listing_id_idx
  ON lootaura_v2.ingested_sales (source_platform, source_listing_id)
  WHERE source_listing_id IS NOT NULL;

COMMENT ON COLUMN lootaura_v2.ingested_sales.sale_instance_key IS
  'Phase 3: stable sale-instance identity (location + date window + listing id); not enforced as unique until Phase 10.';
COMMENT ON COLUMN lootaura_v2.ingested_sales.source_listing_id IS
  'Phase 3: YSTM numeric path segment when present (e.g. 961002738 from listing.html).';
