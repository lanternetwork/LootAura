-- 149_create_ingestion_v1_schema.sql
-- Ingestion v1 schema: staging tables, run tracking, city configs, and sales provenance.
-- This migration is idempotent and follows lootaura_v2 schema + RLS conventions.

-- Local updated_at helper for this migration's tables.
-- Some environments may not have lootaura_v2.update_updated_at_column() available.
CREATE OR REPLACE FUNCTION lootaura_v2.update_ingestion_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1) INGESTED SALES (staging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lootaura_v2.ingested_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  source_platform text NOT NULL,
  source_url text NOT NULL,
  external_id text NULL,

  -- Raw
  raw_text text NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Normalized
  title text NULL,
  description text NULL,
  address_raw text NULL,
  normalized_address text NULL,
  city text NULL,
  state text NULL,
  zip_code text NULL,
  lat numeric NULL,
  lng numeric NULL,

  -- Date / Time
  date_start date NULL,
  date_end date NULL,
  time_start time NULL,
  time_end time NULL,
  date_source text NULL,
  time_source text NULL CHECK (time_source IN ('explicit', 'default')),

  -- Image
  image_source_url text NULL,
  image_cloudinary_url text NULL,
  image_status text NOT NULL DEFAULT 'none'
    CHECK (image_status IN ('success', 'failed', 'none')),

  -- State
  status text NOT NULL DEFAULT 'needs_check'
    CHECK (status IN ('ready', 'needs_check', 'publishing', 'published', 'publish_failed', 'rejected')),
  failure_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_details jsonb NULL,

  -- Parser metadata
  parser_version text NULL,
  parse_confidence text NULL CHECK (parse_confidence IN ('high', 'low')),

  -- Dedupe
  normalized_date date NULL,
  fingerprint text NULL,
  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_of uuid NULL REFERENCES lootaura_v2.ingested_sales(id) ON DELETE SET NULL,

  -- Publish tracking
  published_sale_id uuid NULL REFERENCES lootaura_v2.sales(id) ON DELETE SET NULL,
  published_at timestamptz NULL,

  -- Audit
  tagged_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ingested_sales_source_url_uniq UNIQUE (source_url),
  CONSTRAINT ingested_sales_failure_reasons_is_array CHECK (jsonb_typeof(failure_reasons) = 'array'),
  CONSTRAINT ingested_sales_raw_payload_is_object CHECK (jsonb_typeof(raw_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ingested_sales_publish_claim
  ON lootaura_v2.ingested_sales(status, is_duplicate, published_sale_id);

CREATE INDEX IF NOT EXISTS idx_ingested_sales_address_date
  ON lootaura_v2.ingested_sales(normalized_address, date_start);

CREATE INDEX IF NOT EXISTS idx_ingested_sales_duplicate_of
  ON lootaura_v2.ingested_sales(duplicate_of);

-- Keep updated_at current
DROP TRIGGER IF EXISTS trg_ingested_sales_updated_at ON lootaura_v2.ingested_sales;
CREATE TRIGGER trg_ingested_sales_updated_at
  BEFORE UPDATE ON lootaura_v2.ingested_sales
  FOR EACH ROW
  EXECUTE FUNCTION lootaura_v2.update_ingestion_updated_at_column();

ALTER TABLE lootaura_v2.ingested_sales ENABLE ROW LEVEL SECURITY;

-- Admin-only authenticated access via helper; server-side service role can do all operations.
DROP POLICY IF EXISTS ingested_sales_admin_select ON lootaura_v2.ingested_sales;
CREATE POLICY ingested_sales_admin_select ON lootaura_v2.ingested_sales
  FOR SELECT TO authenticated
  USING (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingested_sales_admin_insert ON lootaura_v2.ingested_sales;
CREATE POLICY ingested_sales_admin_insert ON lootaura_v2.ingested_sales
  FOR INSERT TO authenticated
  WITH CHECK (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingested_sales_admin_update ON lootaura_v2.ingested_sales;
CREATE POLICY ingested_sales_admin_update ON lootaura_v2.ingested_sales
  FOR UPDATE TO authenticated
  USING (lootaura_v2.is_current_user_admin())
  WITH CHECK (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingested_sales_admin_delete ON lootaura_v2.ingested_sales;
CREATE POLICY ingested_sales_admin_delete ON lootaura_v2.ingested_sales
  FOR DELETE TO authenticated
  USING (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingested_sales_service_role_all ON lootaura_v2.ingested_sales;
CREATE POLICY ingested_sales_service_role_all ON lootaura_v2.ingested_sales
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.ingested_sales TO authenticated;
GRANT ALL ON lootaura_v2.ingested_sales TO service_role;

-- ============================================================================
-- 2) INGESTION RUNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lootaura_v2.ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  run_type text NOT NULL,

  fetched_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  ready_count integer NOT NULL DEFAULT 0,
  needs_check_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  published_count integer NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'failed'
    CHECK (status IN ('success', 'partial', 'failed', 'running')),
  error_summary text NULL,
  page_status jsonb NOT NULL DEFAULT '{}'::jsonb,

  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  duration_ms integer NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ingestion_runs_page_status_is_object CHECK (jsonb_typeof(page_status) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_source_city
  ON lootaura_v2.ingestion_runs(started_at, source_platform, city);

DROP TRIGGER IF EXISTS trg_ingestion_runs_updated_at ON lootaura_v2.ingestion_runs;
CREATE TRIGGER trg_ingestion_runs_updated_at
  BEFORE UPDATE ON lootaura_v2.ingestion_runs
  FOR EACH ROW
  EXECUTE FUNCTION lootaura_v2.update_ingestion_updated_at_column();

ALTER TABLE lootaura_v2.ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_runs_admin_select ON lootaura_v2.ingestion_runs;
CREATE POLICY ingestion_runs_admin_select ON lootaura_v2.ingestion_runs
  FOR SELECT TO authenticated
  USING (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_runs_admin_insert ON lootaura_v2.ingestion_runs;
CREATE POLICY ingestion_runs_admin_insert ON lootaura_v2.ingestion_runs
  FOR INSERT TO authenticated
  WITH CHECK (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_runs_admin_update ON lootaura_v2.ingestion_runs;
CREATE POLICY ingestion_runs_admin_update ON lootaura_v2.ingestion_runs
  FOR UPDATE TO authenticated
  USING (lootaura_v2.is_current_user_admin())
  WITH CHECK (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_runs_admin_delete ON lootaura_v2.ingestion_runs;
CREATE POLICY ingestion_runs_admin_delete ON lootaura_v2.ingestion_runs
  FOR DELETE TO authenticated
  USING (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_runs_service_role_all ON lootaura_v2.ingestion_runs;
CREATE POLICY ingestion_runs_service_role_all ON lootaura_v2.ingestion_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.ingestion_runs TO authenticated;
GRANT ALL ON lootaura_v2.ingestion_runs TO service_role;

-- ============================================================================
-- 3) INGESTION CITY CONFIGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lootaura_v2.ingestion_city_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  state text NOT NULL,
  timezone text NOT NULL, -- IANA timezone name
  enabled boolean NOT NULL DEFAULT true,
  source_platform text NOT NULL,
  source_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ingestion_city_configs_scope_uniq UNIQUE (city, state, source_platform),
  CONSTRAINT ingestion_city_configs_source_pages_is_array CHECK (jsonb_typeof(source_pages) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_ingestion_city_configs_enabled_source
  ON lootaura_v2.ingestion_city_configs(enabled, source_platform);

DROP TRIGGER IF EXISTS trg_ingestion_city_configs_updated_at ON lootaura_v2.ingestion_city_configs;
CREATE TRIGGER trg_ingestion_city_configs_updated_at
  BEFORE UPDATE ON lootaura_v2.ingestion_city_configs
  FOR EACH ROW
  EXECUTE FUNCTION lootaura_v2.update_ingestion_updated_at_column();

ALTER TABLE lootaura_v2.ingestion_city_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_city_configs_admin_select ON lootaura_v2.ingestion_city_configs;
CREATE POLICY ingestion_city_configs_admin_select ON lootaura_v2.ingestion_city_configs
  FOR SELECT TO authenticated
  USING (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_city_configs_admin_insert ON lootaura_v2.ingestion_city_configs;
CREATE POLICY ingestion_city_configs_admin_insert ON lootaura_v2.ingestion_city_configs
  FOR INSERT TO authenticated
  WITH CHECK (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_city_configs_admin_update ON lootaura_v2.ingestion_city_configs;
CREATE POLICY ingestion_city_configs_admin_update ON lootaura_v2.ingestion_city_configs
  FOR UPDATE TO authenticated
  USING (lootaura_v2.is_current_user_admin())
  WITH CHECK (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_city_configs_admin_delete ON lootaura_v2.ingestion_city_configs;
CREATE POLICY ingestion_city_configs_admin_delete ON lootaura_v2.ingestion_city_configs
  FOR DELETE TO authenticated
  USING (lootaura_v2.is_current_user_admin());

DROP POLICY IF EXISTS ingestion_city_configs_service_role_all ON lootaura_v2.ingestion_city_configs;
CREATE POLICY ingestion_city_configs_service_role_all ON lootaura_v2.ingestion_city_configs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.ingestion_city_configs TO authenticated;
GRANT ALL ON lootaura_v2.ingestion_city_configs TO service_role;

-- ============================================================================
-- 4) SALES PROVENANCE (nullable, non-breaking)
-- ============================================================================
ALTER TABLE IF EXISTS lootaura_v2.sales
  ADD COLUMN IF NOT EXISTS import_source text NULL,
  ADD COLUMN IF NOT EXISTS external_source_url text NULL,
  ADD COLUMN IF NOT EXISTS ingested_sale_id uuid NULL REFERENCES lootaura_v2.ingested_sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_import_source
  ON lootaura_v2.sales(import_source)
  WHERE import_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_ingested_sale_id
  ON lootaura_v2.sales(ingested_sale_id)
  WHERE ingested_sale_id IS NOT NULL;

-- Documentation
COMMENT ON TABLE lootaura_v2.ingested_sales IS
  'Staging table for external ingestion records. Records are normalized, validated, deduped, and conditionally published to sales.';
COMMENT ON TABLE lootaura_v2.ingestion_runs IS
  'Operational run log for ingestion executions including per-run counters, status, and page-level status payloads.';
COMMENT ON TABLE lootaura_v2.ingestion_city_configs IS
  'City-level ingestion configuration, including timezone and explicit source page scope.';
COMMENT ON COLUMN lootaura_v2.sales.import_source IS
  'Provenance marker for imported sales records (for example: external_page_source, manual_upload).';
COMMENT ON COLUMN lootaura_v2.sales.external_source_url IS
  'Canonical source URL of external listing used for provenance/debugging.';
COMMENT ON COLUMN lootaura_v2.sales.ingested_sale_id IS
  'Reference to the ingestion staging record that produced this sale.';

