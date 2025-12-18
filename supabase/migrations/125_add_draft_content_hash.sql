-- Add content_hash column to sale_drafts for deduplication
-- Allows server to detect when draft content hasn't changed and skip unnecessary updates

ALTER TABLE lootaura_v2.sale_drafts
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Index for content_hash lookups (useful for deduplication queries)
CREATE INDEX IF NOT EXISTS sale_drafts_content_hash
ON lootaura_v2.sale_drafts (user_id, draft_key, content_hash)
WHERE status = 'active';

-- Add comment explaining the column
COMMENT ON COLUMN lootaura_v2.sale_drafts.content_hash IS 'SHA-256 hash of canonicalized draft payload content (excludes meta fields like currentStep). Used for deduplication to prevent no-op saves.';

