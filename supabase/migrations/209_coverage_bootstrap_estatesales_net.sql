-- Deprecated key superseded by migration 211 `esnet_bootstrap_enabled`.
-- Retained for PRs that applied 209 before 211; 211 inserts the canonical bootstrap row.

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor, coverage_bootstrap_enabled)
VALUES ('coverage_bootstrap_estatesales_net', 0, false)
ON CONFLICT (key) DO NOTHING;
