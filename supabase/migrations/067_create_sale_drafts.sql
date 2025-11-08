-- Create sale_drafts table for durable draft persistence
-- Supports both local autosave and server-side drafts for signed-in users

CREATE TABLE IF NOT EXISTS lootaura_v2.sale_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  draft_key UUID NOT NULL,                -- idempotency key (client-generated)
  title TEXT,
  payload JSONB NOT NULL,                 -- full wizard state (safe fields only)
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'published' | 'archived'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  CONSTRAINT sale_drafts_status_check CHECK (status IN ('active', 'published', 'archived'))
);

-- Unique index for idempotency (one active draft per user per draft_key)
CREATE UNIQUE INDEX IF NOT EXISTS sale_drafts_user_key
  ON lootaura_v2.sale_drafts (user_id, draft_key)
  WHERE status = 'active';

-- Index for fetching latest draft by user
CREATE INDEX IF NOT EXISTS sale_drafts_user_status_updated
  ON lootaura_v2.sale_drafts (user_id, status, updated_at DESC);

-- Index for cleanup job (expired drafts)
CREATE INDEX IF NOT EXISTS sale_drafts_expires_at
  ON lootaura_v2.sale_drafts (expires_at);

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS sale_drafts_status
  ON lootaura_v2.sale_drafts (status);

-- RLS
ALTER TABLE lootaura_v2.sale_drafts ENABLE ROW LEVEL SECURITY;

-- Policies: owner-only access
CREATE POLICY "select own drafts"
  ON lootaura_v2.sale_drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "insert own drafts"
  ON lootaura_v2.sale_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own drafts"
  ON lootaura_v2.sale_drafts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "delete own drafts"
  ON lootaura_v2.sale_drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION lootaura_v2.update_sale_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sale_drafts_updated_at
  BEFORE UPDATE ON lootaura_v2.sale_drafts
  FOR EACH ROW
  EXECUTE FUNCTION lootaura_v2.update_sale_drafts_updated_at();

-- Cleanup function for expired and old drafts
CREATE OR REPLACE FUNCTION lootaura_v2.cleanup_sale_drafts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired drafts (expires_at < now)
  DELETE FROM lootaura_v2.sale_drafts 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Also delete non-active drafts older than 30 days
  DELETE FROM lootaura_v2.sale_drafts 
  WHERE status != 'active' 
    AND updated_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

