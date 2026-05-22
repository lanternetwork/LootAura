-- YSTM nationwide graph enumeration: persisted city/list page candidate registry.

CREATE TABLE IF NOT EXISTS lootaura_v2.ystm_source_page_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  canonical_url text NOT NULL,
  state text NOT NULL,
  city_slug text NULL,
  discovered_from_url text NULL,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (
      validation_status IN (
        'pending',
        'validated',
        'invalid_shell',
        'blocked',
        'fetch_failed',
        'empty_list',
        'non_city_page',
        'not_found'
      )
    ),
  validation_failure_reason text NULL,
  promoted_config_id uuid NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS ystm_source_page_candidates_canonical_url_idx
  ON lootaura_v2.ystm_source_page_candidates (canonical_url);

CREATE INDEX IF NOT EXISTS ystm_source_page_candidates_validation_status_idx
  ON lootaura_v2.ystm_source_page_candidates (validation_status);

CREATE INDEX IF NOT EXISTS ystm_source_page_candidates_state_idx
  ON lootaura_v2.ystm_source_page_candidates (state);

CREATE INDEX IF NOT EXISTS ystm_source_page_candidates_pending_idx
  ON lootaura_v2.ystm_source_page_candidates (last_seen_at)
  WHERE validation_status = 'pending';

ALTER TABLE lootaura_v2.ystm_source_page_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ystm_source_page_candidates_service_role_all
  ON lootaura_v2.ystm_source_page_candidates;
CREATE POLICY ystm_source_page_candidates_service_role_all
  ON lootaura_v2.ystm_source_page_candidates
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON lootaura_v2.ystm_source_page_candidates TO service_role;

COMMENT ON TABLE lootaura_v2.ystm_source_page_candidates IS
  'Nationwide YSTM city/list page candidates from graph enumeration (canonical URL dedupe).';
