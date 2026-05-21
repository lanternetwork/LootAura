-- Phase 5: bounded repair for known YSTM ingested_sales backlog (needs_check / publish_failed / coord gaps).

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS catalog_repair_attempted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS catalog_repair_outcome text NULL
    CHECK (
      catalog_repair_outcome IS NULL
      OR catalog_repair_outcome IN (
        'published',
        'geocoded',
        'refreshed_ready',
        'marked_expired',
        'skipped_not_eligible',
        'failed'
      )
    ),
  ADD COLUMN IF NOT EXISTS catalog_repair_failure_reason text NULL;

CREATE INDEX IF NOT EXISTS ingested_sales_catalog_repair_queue_idx
  ON lootaura_v2.ingested_sales (catalog_repair_attempted_at NULLS FIRST, updated_at)
  WHERE source_platform = 'external_page_source' AND is_duplicate = false;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor)
VALUES ('ystm_coverage_catalog_repair', 0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN lootaura_v2.ingested_sales.catalog_repair_outcome IS
  'Last bounded YSTM catalog repair attempt (detail-first + geocode/publish lifecycle).';
