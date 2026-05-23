-- Phase 10: relax source_url uniqueness; enforce active sale_instance_key uniqueness.

-- Resolve duplicate active sale_instance_key rows before adding partial unique index.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY source_platform, sale_instance_key
      ORDER BY updated_at DESC NULLS LAST, id ASC
    ) AS keeper_id,
    ROW_NUMBER() OVER (
      PARTITION BY source_platform, sale_instance_key
      ORDER BY updated_at DESC NULLS LAST, id ASC
    ) AS rn
  FROM lootaura_v2.ingested_sales
  WHERE superseded_by_ingested_sale_id IS NULL
    AND sale_instance_key IS NOT NULL
)
UPDATE lootaura_v2.ingested_sales AS s
SET
  superseded_by_ingested_sale_id = ranked.keeper_id,
  superseded_at = now(),
  superseded_reason = 'phase_10_active_key_dedupe'
FROM ranked
WHERE s.id = ranked.id
  AND ranked.rn > 1
  AND ranked.keeper_id IS DISTINCT FROM s.id;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_source_url_uniq;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_source_url_key;

CREATE INDEX IF NOT EXISTS ingested_sales_source_url_lookup_idx
  ON lootaura_v2.ingested_sales (source_url);

DROP INDEX IF EXISTS lootaura_v2.ingested_sales_sale_instance_key_idx;

CREATE UNIQUE INDEX IF NOT EXISTS ingested_sales_active_sale_instance_key_uniq
  ON lootaura_v2.ingested_sales (source_platform, sale_instance_key)
  WHERE superseded_by_ingested_sale_id IS NULL
    AND sale_instance_key IS NOT NULL;

COMMENT ON INDEX lootaura_v2.ingested_sales_active_sale_instance_key_uniq IS
  'Phase 10: one active ingested row per sale instance; superseded rows may share keys.';
