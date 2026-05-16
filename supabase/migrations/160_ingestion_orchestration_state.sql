CREATE TABLE IF NOT EXISTS lootaura_v2.ingestion_orchestration_state (
  key text PRIMARY KEY,
  cursor integer NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  lease_owner text NULL,
  lease_expires_at timestamptz NULL,
  last_started_at timestamptz NULL,
  last_completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lootaura_v2.ingestion_orchestration_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_orchestration_state_service_role_all ON lootaura_v2.ingestion_orchestration_state;
CREATE POLICY ingestion_orchestration_state_service_role_all ON lootaura_v2.ingestion_orchestration_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON lootaura_v2.ingestion_orchestration_state TO service_role;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor)
VALUES ('external_page_source', 0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE lootaura_v2.ingestion_orchestration_state IS
  'Singleton state row for ingestion orchestration lease + resumable cursor.';
