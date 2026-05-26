-- Phase E: daily operational SLO snapshots for cross-provider duplicate-publish prevention.

CREATE TABLE IF NOT EXISTS lootaura_v2.cross_provider_convergence_slo_daily (
  slo_date date PRIMARY KEY,
  duplicate_published_canonical_clusters integer NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cross_provider_convergence_slo_daily_recorded_at_idx
  ON lootaura_v2.cross_provider_convergence_slo_daily (recorded_at DESC);

COMMENT ON TABLE lootaura_v2.cross_provider_convergence_slo_daily IS
  'Phase E: UTC-day count of canonical_sale_instance_key groups with >1 distinct published_sale_id (must stay 0 for SLO hold).';
