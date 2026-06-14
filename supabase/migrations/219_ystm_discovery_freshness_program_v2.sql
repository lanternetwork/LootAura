-- DISCOVERY_FRESHNESS_PROGRAM_V2 Phase 1: listing lifecycle timestamps + latency view.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS first_list_seen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS first_observed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS first_ingested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ystm_listing_posted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS appearance_source text NULL;

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.first_list_seen_at IS
  'First time this listing URL was seen on a YSTM list page by LootAura coverage audit.';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.first_observed_at IS
  'First time this listing entered the observation layer (defaults to first list see).';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.first_ingested_at IS
  'First time this listing was ingested into ingested_sales.';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.first_published_at IS
  'First time this listing became visible via published sale linkage.';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.ystm_listing_posted_at IS
  'Parsed YSTM listing post time when available; preferred anchor for discovery latency.';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.appearance_source IS
  'How first_known_ystm_appearance was derived: ystm_metadata | observation_proxy.';

-- Backfill first-seen columns from existing last_list_seen_at / updated_at.
UPDATE lootaura_v2.ystm_coverage_observations
SET
  first_list_seen_at = COALESCE(first_list_seen_at, last_list_seen_at, updated_at),
  first_observed_at = COALESCE(first_observed_at, last_list_seen_at, updated_at),
  appearance_source = COALESCE(appearance_source, 'observation_proxy')
WHERE first_list_seen_at IS NULL OR first_observed_at IS NULL;

CREATE OR REPLACE FUNCTION lootaura_v2.trg_ystm_coverage_observations_preserve_first_seen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.first_list_seen_at := COALESCE(NEW.first_list_seen_at, NEW.last_list_seen_at, NEW.updated_at, now());
    NEW.first_observed_at := COALESCE(NEW.first_observed_at, NEW.first_list_seen_at);
  ELSE
    NEW.first_list_seen_at := COALESCE(OLD.first_list_seen_at, NEW.last_list_seen_at, NEW.updated_at);
    NEW.first_observed_at := COALESCE(OLD.first_observed_at, NEW.first_list_seen_at);
    NEW.first_ingested_at := COALESCE(OLD.first_ingested_at, NEW.first_ingested_at);
    NEW.first_published_at := COALESCE(OLD.first_published_at, NEW.first_published_at);
    NEW.ystm_listing_posted_at := COALESCE(OLD.ystm_listing_posted_at, NEW.ystm_listing_posted_at);
    NEW.appearance_source := COALESCE(OLD.appearance_source, NEW.appearance_source);
  END IF;

  IF NEW.ystm_listing_posted_at IS NOT NULL THEN
    NEW.appearance_source := COALESCE(NEW.appearance_source, 'ystm_metadata');
  ELSIF NEW.appearance_source IS NULL AND NEW.first_list_seen_at IS NOT NULL THEN
    NEW.appearance_source := 'observation_proxy';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ystm_coverage_observations_preserve_first_seen_trg
  ON lootaura_v2.ystm_coverage_observations;

CREATE TRIGGER ystm_coverage_observations_preserve_first_seen_trg
  BEFORE INSERT OR UPDATE ON lootaura_v2.ystm_coverage_observations
  FOR EACH ROW
  EXECUTE FUNCTION lootaura_v2.trg_ystm_coverage_observations_preserve_first_seen();

CREATE OR REPLACE VIEW lootaura_v2.ystm_discovery_latency_v1 AS
SELECT
  o.canonical_url,
  o.config_key,
  o.state,
  o.city,
  o.ystm_valid_active,
  o.lootaura_visible,
  o.false_exclusion_primary_bucket,
  COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at) AS first_known_ystm_appearance,
  o.appearance_source,
  o.first_observed_at,
  o.first_ingested_at,
  o.first_published_at,
  o.last_list_seen_at,
  CASE
    WHEN COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at) IS NULL
      OR o.first_observed_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (o.first_observed_at - COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at))) / 3600.0
  END AS discovery_latency_hours,
  CASE
    WHEN COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at) IS NULL
      OR o.first_published_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (o.first_published_at - COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at))) / 3600.0
  END AS publish_latency_hours,
  CASE
    WHEN o.first_observed_at IS NULL OR o.first_ingested_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (o.first_ingested_at - o.first_observed_at)) / 3600.0
  END AS observe_to_ingest_hours,
  CASE
    WHEN o.first_ingested_at IS NULL OR o.first_published_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (o.first_published_at - o.first_ingested_at)) / 3600.0
  END AS ingest_to_publish_hours
FROM lootaura_v2.ystm_coverage_observations o;

COMMENT ON VIEW lootaura_v2.ystm_discovery_latency_v1 IS
  'Listing-level discovery/publish latency (DISCOVERY_FRESHNESS_PROGRAM_V2 Phase 1).';

GRANT SELECT ON lootaura_v2.ystm_discovery_latency_v1 TO service_role;
