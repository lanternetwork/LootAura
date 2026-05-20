-- Allow YSTM detail-first schedule provenance on ingested_sales.time_source.

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_time_source_check;

ALTER TABLE lootaura_v2.ingested_sales
  ADD CONSTRAINT ingested_sales_time_source_check
  CHECK (
    time_source IS NULL
    OR time_source IN ('explicit', 'default', 'ystm_detail_page')
  );

COMMENT ON COLUMN lootaura_v2.ingested_sales.time_source IS
  'Schedule time provenance: explicit/default (legacy ingest) or ystm_detail_page (detail-first hour range).';

COMMIT;
