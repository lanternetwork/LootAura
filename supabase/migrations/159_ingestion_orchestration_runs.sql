-- Append-only metrics for cron ingestion orchestration (geocode + publish windows).
-- Does not replace ingestion_runs (upload / external fetch tracking).

CREATE TABLE IF NOT EXISTS lootaura_v2.ingestion_orchestration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  mode text NOT NULL CHECK (mode IN ('daily', 'ingestion')),

  batch_size integer NOT NULL,
  concurrency integer NOT NULL,

  claimed_count integer NOT NULL,
  geocode_succeeded_count integer NOT NULL,
  failed_retriable_count integer NOT NULL,
  failed_terminal_count integer NOT NULL,

  publish_attempted_count integer NOT NULL,
  publish_succeeded_count integer NOT NULL,
  publish_failed_count integer NOT NULL,
  publish_skipped_count integer NOT NULL DEFAULT 0,

  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  rate_429_count integer NOT NULL DEFAULT 0,

  notes jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_ingestion_orchestration_runs_created_at
  ON lootaura_v2.ingestion_orchestration_runs (created_at DESC);

ALTER TABLE lootaura_v2.ingestion_orchestration_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_orchestration_runs_admin_select ON lootaura_v2.ingestion_orchestration_runs;
CREATE POLICY ingestion_orchestration_runs_admin_select ON lootaura_v2.ingestion_orchestration_runs
  FOR SELECT TO authenticated
  USING (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_orchestration_runs_service_role_all ON lootaura_v2.ingestion_orchestration_runs;
CREATE POLICY ingestion_orchestration_runs_service_role_all ON lootaura_v2.ingestion_orchestration_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON lootaura_v2.ingestion_orchestration_runs TO authenticated;
GRANT ALL ON lootaura_v2.ingestion_orchestration_runs TO service_role;

COMMENT ON TABLE lootaura_v2.ingestion_orchestration_runs IS
  'One row per ingestion orchestration (geocode + publish); observability only.';
