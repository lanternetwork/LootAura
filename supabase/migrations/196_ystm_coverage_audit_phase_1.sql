-- Phase 1: YSTM nationwide coverage audit (scoreboard denominator + snapshots).

CREATE TABLE IF NOT EXISTS lootaura_v2.ystm_coverage_observations (
  canonical_url text PRIMARY KEY,
  state text NULL,
  city text NULL,
  config_key text NULL,
  ystm_valid_active boolean NOT NULL DEFAULT false,
  ystm_invalid_reason text NULL,
  lootaura_visible boolean NOT NULL DEFAULT false,
  last_list_seen_at timestamptz NULL,
  last_detail_checked_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_valid_active_idx
  ON lootaura_v2.ystm_coverage_observations (ystm_valid_active)
  WHERE ystm_valid_active = true;

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_state_idx
  ON lootaura_v2.ystm_coverage_observations (state);

ALTER TABLE lootaura_v2.ystm_coverage_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ystm_coverage_observations_service_role_all
  ON lootaura_v2.ystm_coverage_observations;
CREATE POLICY ystm_coverage_observations_service_role_all
  ON lootaura_v2.ystm_coverage_observations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON lootaura_v2.ystm_coverage_observations TO service_role;

CREATE TABLE IF NOT EXISTS lootaura_v2.ystm_coverage_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'skipped')),
  skip_reason text NULL,
  config_cursor_before integer NOT NULL DEFAULT 0,
  config_cursor_after integer NOT NULL DEFAULT 0,
  list_pages_fetched integer NOT NULL DEFAULT 0,
  listing_urls_discovered integer NOT NULL DEFAULT 0,
  detail_pages_validated integer NOT NULL DEFAULT 0,
  valid_active_ystm_urls integer NOT NULL DEFAULT 0,
  published_visible_in_audit integer NOT NULL DEFAULT 0,
  lootaura_published_active_total integer NOT NULL DEFAULT 0,
  missing_valid_ystm_urls integer NOT NULL DEFAULT 0,
  coverage_pct numeric NULL,
  missing_by_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_by_metro jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ystm_coverage_audit_runs_completed_at_idx
  ON lootaura_v2.ystm_coverage_audit_runs (completed_at DESC NULLS LAST);

ALTER TABLE lootaura_v2.ystm_coverage_audit_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ystm_coverage_audit_runs_service_role_all ON lootaura_v2.ystm_coverage_audit_runs;
CREATE POLICY ystm_coverage_audit_runs_service_role_all ON lootaura_v2.ystm_coverage_audit_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON lootaura_v2.ystm_coverage_audit_runs TO service_role;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor)
VALUES ('ystm_coverage_audit', 0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE lootaura_v2.ystm_coverage_observations IS
  'Accumulated YSTM listing URL observations from bounded coverage audits (canonical URL key).';
COMMENT ON TABLE lootaura_v2.ystm_coverage_audit_runs IS
  'Per-run snapshots for YSTM product coverage scoreboard (valid active / visible / missing).';
