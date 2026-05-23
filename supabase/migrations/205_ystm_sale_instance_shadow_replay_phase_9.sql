-- Phase 9: shadow replay of legacy URL gate vs sale-instance classifier on missing valid URLs.

CREATE TABLE IF NOT EXISTS lootaura_v2.ystm_sale_instance_shadow_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url text NOT NULL,
  state text NULL,
  city text NULL,
  replayed_at timestamptz NOT NULL DEFAULT now(),
  old_decision text NOT NULL,
  new_decision text NOT NULL,
  old_would_suppress boolean NOT NULL,
  new_would_suppress boolean NOT NULL,
  would_publish boolean NOT NULL,
  would_create_new_instance boolean NOT NULL,
  confidence text NOT NULL,
  reason_codes text[] NOT NULL DEFAULT '{}',
  old_skip_sub_reason text NULL,
  divergence_kind text NULL,
  ingested_sale_id uuid NULL REFERENCES lootaura_v2.ingested_sales (id) ON DELETE SET NULL,
  sale_instance_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ystm_sale_instance_shadow_replays_canonical_url_idx
  ON lootaura_v2.ystm_sale_instance_shadow_replays (canonical_url);

CREATE INDEX IF NOT EXISTS ystm_sale_instance_shadow_replays_divergence_idx
  ON lootaura_v2.ystm_sale_instance_shadow_replays (divergence_kind)
  WHERE divergence_kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS ystm_sale_instance_shadow_replays_replayed_at_idx
  ON lootaura_v2.ystm_sale_instance_shadow_replays (replayed_at DESC);

COMMENT ON TABLE lootaura_v2.ystm_sale_instance_shadow_replays IS
  'Phase 9: persisted old-vs-new sale instance decisions for missing valid YSTM URLs (shadow mode).';
