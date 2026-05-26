-- Phase A (cross-provider convergence): persist canonical_sale_instance_key for telemetry/backfill.
-- No ingest or publish behavior change in this migration.

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS canonical_sale_instance_key text NULL;

COMMENT ON COLUMN lootaura_v2.ingested_sales.canonical_sale_instance_key IS
  'Cross-provider sale event fingerprint (location + schedule). Phase A: observability/backfill only.';

CREATE INDEX IF NOT EXISTS idx_ingested_sales_canonical_sale_instance_active
  ON lootaura_v2.ingested_sales (canonical_sale_instance_key)
  WHERE superseded_by_ingested_sale_id IS NULL
    AND is_duplicate = false
    AND canonical_sale_instance_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingested_sales_canonical_sale_instance_published
  ON lootaura_v2.ingested_sales (canonical_sale_instance_key, published_sale_id)
  WHERE published_sale_id IS NOT NULL
    AND canonical_sale_instance_key IS NOT NULL;
