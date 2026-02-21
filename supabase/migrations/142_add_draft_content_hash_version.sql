-- Add content_hash and version columns to sale_drafts for server-side deduplication
-- content_hash: SHA256 hash of normalized payload (prevents duplicate writes)
-- version: Increments on each write (enables optimistic concurrency control)

-- Add content_hash column (nullable initially for zero-risk rollout)
ALTER TABLE lootaura_v2.sale_drafts
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Add version column (defaults to 1 for existing rows)
ALTER TABLE lootaura_v2.sale_drafts
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Create index on content_hash for fast lookups during deduplication
CREATE INDEX IF NOT EXISTS sale_drafts_content_hash_idx
  ON lootaura_v2.sale_drafts (user_id, draft_key, content_hash)
  WHERE status = 'active';

-- Add comment explaining the columns
COMMENT ON COLUMN lootaura_v2.sale_drafts.content_hash IS 'SHA256 hash of normalized payload for deduplication';
COMMENT ON COLUMN lootaura_v2.sale_drafts.version IS 'Increments on each write for optimistic concurrency control';
