-- Store shareable link payloads in lootaura_v2 (same PostgREST schema as the rest of the app).
-- public.shared_states (051) may be missing or not exposed in some environments; service_role
-- access via getAdminDb() is reliable here.

CREATE TABLE IF NOT EXISTS lootaura_v2.shared_states (
  id TEXT PRIMARY KEY,
  state_json JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_states_created_at_v2
  ON lootaura_v2.shared_states (created_at);

-- One-time copy from legacy public.shared_states when that table exists (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shared_states'
  ) THEN
    INSERT INTO lootaura_v2.shared_states (id, state_json, version, created_at)
    SELECT id, state_json, COALESCE(version, 1), COALESCE(created_at, NOW())
    FROM public.shared_states
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

ALTER TABLE lootaura_v2.shared_states ENABLE ROW LEVEL SECURITY;
