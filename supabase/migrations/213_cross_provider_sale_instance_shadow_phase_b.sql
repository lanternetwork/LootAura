-- Phase B (cross-provider convergence): shadow disposition replay — no ingest/publish enforcement.

CREATE TABLE IF NOT EXISTS lootaura_v2.cross_provider_sale_instance_shadow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incoming_source_url text NOT NULL,
  incoming_source_platform text NOT NULL,
  incoming_canonical_sale_instance_key text NULL,
  matched_ingested_sale_id uuid NULL REFERENCES lootaura_v2.ingested_sales (id) ON DELETE SET NULL,
  matched_source_platform text NULL,
  matched_canonical_sale_instance_key text NULL,
  matched_published_sale_id uuid NULL,
  disposition text NOT NULL,
  confidence text NOT NULL,
  match_method text NULL,
  match_reasons text[] NOT NULL DEFAULT '{}',
  is_false_negative boolean NOT NULL DEFAULT false,
  current_would_soft_skip boolean NOT NULL DEFAULT false,
  context text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cross_provider_shadow_recorded_at_idx
  ON lootaura_v2.cross_provider_sale_instance_shadow (recorded_at DESC);

CREATE INDEX IF NOT EXISTS cross_provider_shadow_false_negative_idx
  ON lootaura_v2.cross_provider_sale_instance_shadow (is_false_negative, recorded_at DESC)
  WHERE is_false_negative = true;

CREATE INDEX IF NOT EXISTS cross_provider_shadow_disposition_idx
  ON lootaura_v2.cross_provider_sale_instance_shadow (disposition, recorded_at DESC);

COMMENT ON TABLE lootaura_v2.cross_provider_sale_instance_shadow IS
  'Phase B: shadow cross-provider convergence disposition (would-link vs would-publish-distinct) without changing ingest.';
