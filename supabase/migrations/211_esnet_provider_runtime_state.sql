-- EstateSales.NET provider runtime control (no Vercel env vars).
-- Keys: esnet_ingest_enabled (provider on/off), esnet_bootstrap_enabled (burst budgets only).

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS provider_ingest_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS provider_ingest_enabled_at timestamptz NULL;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS provider_ingest_disabled_at timestamptz NULL;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS provider_ingest_disabled_reason text NULL;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor, provider_ingest_enabled)
VALUES ('esnet_ingest_enabled', 0, false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor, coverage_bootstrap_enabled)
VALUES ('esnet_bootstrap_enabled', 0, false)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.provider_ingest_enabled IS
  'On key esnet_ingest_enabled: when true, ES.net list ingest and discovery lanes run.';
