-- Phase 1A: external source reconciliation metadata (detection-only; no published sale writes).
-- Tracks last sync, hashes, placeholder/cancel flags, and structured diagnostics on ingested_sales.

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS last_source_sync_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_source_change_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS source_sync_status text NULL,
  ADD COLUMN IF NOT EXISTS source_sync_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_sync_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_missing_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_content_hash text NULL,
  ADD COLUMN IF NOT EXISTS source_schedule_hash text NULL,
  ADD COLUMN IF NOT EXISTS source_image_hash text NULL,
  ADD COLUMN IF NOT EXISTS source_placeholder_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_cancelled_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_reconciliation_details jsonb NULL;

COMMENT ON COLUMN lootaura_v2.ingested_sales.last_source_sync_at IS
  'Last time a reconciliation worker attempted a source refresh for this row.';
COMMENT ON COLUMN lootaura_v2.ingested_sales.last_source_change_at IS
  'When stored source fingerprints last differed from the refreshed snapshot (detection-only).';
COMMENT ON COLUMN lootaura_v2.ingested_sales.source_sync_status IS
  'Reconciliation lifecycle: not_checked, fresh, changed, unchanged, source_missing_soft, parse_failed, sync_failed, etc.';
COMMENT ON COLUMN lootaura_v2.ingested_sales.source_reconciliation_details IS
  'Structured reconciliation diagnostics (no raw HTML); includes refresh_capability and change classes.';

CREATE INDEX IF NOT EXISTS idx_ingested_sales_recon_status
  ON lootaura_v2.ingested_sales (source_sync_status)
  WHERE source_sync_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingested_sales_recon_last_sync
  ON lootaura_v2.ingested_sales (last_source_sync_at ASC NULLS FIRST)
  WHERE published_sale_id IS NOT NULL AND source_url IS NOT NULL AND is_duplicate = false;

CREATE INDEX IF NOT EXISTS idx_ingested_sales_recon_placeholder
  ON lootaura_v2.ingested_sales (source_placeholder_detected, last_source_sync_at ASC NULLS FIRST)
  WHERE published_sale_id IS NOT NULL AND is_duplicate = false;

CREATE INDEX IF NOT EXISTS idx_ingested_sales_recon_active_pick
  ON lootaura_v2.ingested_sales (status, published_sale_id, is_duplicate, last_source_sync_at ASC NULLS FIRST)
  WHERE published_sale_id IS NOT NULL AND is_duplicate = false AND source_url IS NOT NULL;

COMMIT;
