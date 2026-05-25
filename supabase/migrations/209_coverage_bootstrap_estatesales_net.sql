-- Provider-scoped coverage bootstrap state for EstateSales.NET (shared columns from 208).

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor, coverage_bootstrap_enabled)
VALUES ('coverage_bootstrap_estatesales_net', 0, false)
ON CONFLICT (key) DO NOTHING;
