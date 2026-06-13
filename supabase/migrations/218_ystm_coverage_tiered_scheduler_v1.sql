-- YSTM_COVERAGE_TIERED_SCHEDULER_V1: dual cursor, tiered flag, per-config audit telemetry.

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS long_tail_cursor integer NOT NULL DEFAULT 0;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS coverage_tiered_scheduler_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS coverage_tiered_scheduler_enabled_at timestamptz NULL;

ALTER TABLE lootaura_v2.ystm_coverage_audit_runs
  ADD COLUMN IF NOT EXISTS selection_mode text NULL,
  ADD COLUMN IF NOT EXISTS tier1_scheduled integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier2_scheduled integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS long_tail_cursor_before integer NULL,
  ADD COLUMN IF NOT EXISTS long_tail_cursor_after integer NULL;

CREATE TABLE IF NOT EXISTS lootaura_v2.ystm_coverage_audit_config_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid NOT NULL REFERENCES lootaura_v2.ystm_coverage_audit_runs(id) ON DELETE CASCADE,
  config_id uuid NULL,
  tier smallint NOT NULL CHECK (tier IN (1, 2)),
  selection_index smallint NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  list_page_url text NULL,
  selected boolean NOT NULL DEFAULT true,
  fetch_started boolean NOT NULL DEFAULT false,
  fetch_completed boolean NOT NULL DEFAULT false,
  urls_extracted integer NOT NULL DEFAULT 0,
  observations_written integer NOT NULL DEFAULT 0,
  outcome text NOT NULL CHECK (outcome IN (
    'skipped_no_pages',
    'fetch_failed',
    'zero_urls_extracted',
    'budget_exhausted',
    'ok_with_observations'
  )),
  list_fetch_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ystm_coverage_audit_config_events_run_idx
  ON lootaura_v2.ystm_coverage_audit_config_events (audit_run_id);

CREATE INDEX IF NOT EXISTS ystm_coverage_audit_config_events_config_idx
  ON lootaura_v2.ystm_coverage_audit_config_events (config_id, created_at DESC)
  WHERE config_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ystm_coverage_audit_config_events_city_state_idx
  ON lootaura_v2.ystm_coverage_audit_config_events (state, city, created_at DESC);

ALTER TABLE lootaura_v2.ystm_coverage_audit_config_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ystm_coverage_audit_config_events_service_role_all
  ON lootaura_v2.ystm_coverage_audit_config_events;
CREATE POLICY ystm_coverage_audit_config_events_service_role_all
  ON lootaura_v2.ystm_coverage_audit_config_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON lootaura_v2.ystm_coverage_audit_config_events TO service_role;

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.long_tail_cursor IS
  'On ystm_coverage_audit: round-robin cursor for Tier 2 long-tail configs when tiered scheduler is enabled.';
COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.coverage_tiered_scheduler_enabled IS
  'On ystm_coverage_audit: when true, strategic Tier 1 metros are scheduled before long-tail rotation.';
COMMENT ON TABLE lootaura_v2.ystm_coverage_audit_config_events IS
  'Per-config coverage audit attempt telemetry (selection, fetch, write outcomes).';
