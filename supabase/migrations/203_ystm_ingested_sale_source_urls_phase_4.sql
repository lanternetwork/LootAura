-- Phase 4: source URL alias history (URL reuse tracking; no uniqueness change on source_url yet).

CREATE TABLE IF NOT EXISTS lootaura_v2.ingested_sale_source_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingested_sale_id uuid NOT NULL REFERENCES lootaura_v2.ingested_sales (id) ON DELETE CASCADE,
  source_platform text NOT NULL,
  source_url text NOT NULL,
  canonical_source_url text NOT NULL,
  source_listing_id text NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true,
  payload_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingested_sale_source_urls_sale_canonical_idx
  ON lootaura_v2.ingested_sale_source_urls (ingested_sale_id, canonical_source_url);

CREATE INDEX IF NOT EXISTS ingested_sale_source_urls_platform_canonical_idx
  ON lootaura_v2.ingested_sale_source_urls (source_platform, canonical_source_url);

CREATE INDEX IF NOT EXISTS ingested_sale_source_urls_source_url_idx
  ON lootaura_v2.ingested_sale_source_urls (source_url);

CREATE INDEX IF NOT EXISTS ingested_sale_source_urls_listing_id_idx
  ON lootaura_v2.ingested_sale_source_urls (source_platform, source_listing_id)
  WHERE source_listing_id IS NOT NULL;

ALTER TABLE lootaura_v2.ingested_sale_source_urls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingested_sale_source_urls_service_role_all
  ON lootaura_v2.ingested_sale_source_urls;
CREATE POLICY ingested_sale_source_urls_service_role_all
  ON lootaura_v2.ingested_sale_source_urls
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON lootaura_v2.ingested_sale_source_urls TO service_role;

COMMENT ON TABLE lootaura_v2.ingested_sale_source_urls IS
  'Append-only URL history per ingested sale; powers refresh, audit matching, and URL reuse detection (Phase 4).';
