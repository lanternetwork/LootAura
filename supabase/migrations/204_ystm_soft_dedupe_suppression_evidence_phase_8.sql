-- Phase 8: explainable soft-dedupe suppression audit trail.

CREATE TABLE IF NOT EXISTS lootaura_v2.ingested_sale_soft_dedupe_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context text NOT NULL,
  source_platform text NOT NULL,
  source_url text NOT NULL,
  duplicate_of_ingested_sale_id uuid NOT NULL REFERENCES lootaura_v2.ingested_sales (id) ON DELETE CASCADE,
  score integer NOT NULL,
  score_breakdown jsonb NOT NULL,
  suppression_reason text NOT NULL,
  incoming_sale_instance_key text NULL,
  matched_sale_instance_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingested_sale_soft_dedupe_suppressions_dup_of_idx
  ON lootaura_v2.ingested_sale_soft_dedupe_suppressions (duplicate_of_ingested_sale_id);

CREATE INDEX IF NOT EXISTS ingested_sale_soft_dedupe_suppressions_source_url_idx
  ON lootaura_v2.ingested_sale_soft_dedupe_suppressions (source_url);

CREATE INDEX IF NOT EXISTS ingested_sale_soft_dedupe_suppressions_created_at_idx
  ON lootaura_v2.ingested_sale_soft_dedupe_suppressions (created_at DESC);
