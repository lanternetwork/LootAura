-- Phase 2: source discovery status columns on ingestion_city_configs (promotion metadata).

ALTER TABLE lootaura_v2.ingestion_city_configs
  ADD COLUMN IF NOT EXISTS source_discovery_status text,
  ADD COLUMN IF NOT EXISTS source_last_discovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_last_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_discovery_failure_reason text;

UPDATE lootaura_v2.ingestion_city_configs
SET source_discovery_status = CASE
  WHEN jsonb_array_length(source_pages) > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(source_pages) AS u(url)
      WHERE u.url ~* '^https://'
    )
  THEN 'manual'
  ELSE 'pending'
END
WHERE source_discovery_status IS NULL;

ALTER TABLE lootaura_v2.ingestion_city_configs
  ALTER COLUMN source_discovery_status SET DEFAULT 'pending';

ALTER TABLE lootaura_v2.ingestion_city_configs
  ALTER COLUMN source_discovery_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ingestion_city_configs_source_discovery_status_chk'
  ) THEN
    ALTER TABLE lootaura_v2.ingestion_city_configs
      ADD CONSTRAINT ingestion_city_configs_source_discovery_status_chk
      CHECK (
        source_discovery_status IN (
          'pending',
          'discovered',
          'validated',
          'failed',
          'manual'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ingestion_city_configs_discovery_status
  ON lootaura_v2.ingestion_city_configs (source_discovery_status, source_platform)
  WHERE source_platform = 'external_page_source';

COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_discovery_status IS
  'Discovery lifecycle: pending (empty placeholder), manual (protected), validated (promoted crawl target), discovered (reserved), failed (unresolved).';
