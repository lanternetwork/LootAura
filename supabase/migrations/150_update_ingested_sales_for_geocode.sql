BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_status_check;

ALTER TABLE lootaura_v2.ingested_sales
  ADD CONSTRAINT ingested_sales_status_check
  CHECK (status IN ('ready', 'needs_check', 'needs_geocode', 'publishing', 'published', 'publish_failed', 'rejected'));

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS geocode_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_geocode_attempt_at timestamptz NULL;

COMMENT ON COLUMN lootaura_v2.ingested_sales.geocode_attempts IS
  'Number of geocoding attempts made by deferred geocode worker.';

COMMENT ON COLUMN lootaura_v2.ingested_sales.last_geocode_attempt_at IS
  'Timestamp of the most recent geocode attempt for cooldown/retry logic.';

COMMIT;

