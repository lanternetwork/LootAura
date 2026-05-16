-- Enforce at most one sales row per ingested_sale_id (ingestion publish idempotency).
-- If this migration fails, remove duplicate `sales` rows sharing the same `ingested_sale_id` then re-run.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_ingested_sale_id_unique
  ON lootaura_v2.sales (ingested_sale_id)
  WHERE ingested_sale_id IS NOT NULL;

COMMIT;
