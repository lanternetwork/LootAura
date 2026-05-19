-- Phase E: post-deploy detail-first metrics window (exclude pre-fix funnel noise).

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS detail_first_metrics_baseline_at timestamptz NULL;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor)
VALUES ('detail_first_metrics_baseline', 0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.detail_first_metrics_baseline_at IS
  'On key detail_first_metrics_baseline: funnel/orchestration rollups count only rows at or after this instant.';
