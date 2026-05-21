-- Phase 4: bounded refresh of known YSTM ingested_sales (dates, content, publish sync).

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor)
VALUES ('ystm_coverage_existing_refresh', 0)
ON CONFLICT (key) DO NOTHING;
