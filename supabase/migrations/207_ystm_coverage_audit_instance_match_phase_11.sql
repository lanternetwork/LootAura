-- Phase 11: coverage audit matches LootAura footprint by sale instance, not URL alone.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS source_listing_id text NULL,
  ADD COLUMN IF NOT EXISTS sale_instance_key text NULL,
  ADD COLUMN IF NOT EXISTS matched_ingested_sale_id uuid NULL,
  ADD COLUMN IF NOT EXISTS matched_sale_id uuid NULL,
  ADD COLUMN IF NOT EXISTS match_method text NULL;

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_sale_instance_key_idx
  ON lootaura_v2.ystm_coverage_observations (sale_instance_key)
  WHERE sale_instance_key IS NOT NULL;

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.match_method IS
  'Phase 11: how lootaura_visible was determined (sale_instance_key, source_listing_id_date_overlap, source_url_alias, source_url_visible, normalized_address_date).';
