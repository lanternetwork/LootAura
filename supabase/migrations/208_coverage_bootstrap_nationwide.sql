-- Temporary nationwide coverage bootstrap control (admin dashboard + auto-disable).

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS coverage_bootstrap_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS coverage_bootstrap_enabled_at timestamptz NULL;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS coverage_bootstrap_disabled_at timestamptz NULL;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS coverage_bootstrap_disabled_reason text NULL;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor, coverage_bootstrap_enabled)
VALUES ('coverage_bootstrap_nationwide', 0, false)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.coverage_bootstrap_enabled IS
  'On key coverage_bootstrap_nationwide: when true, coverage crons use bootstrap budgets and metro-priority audit.';
