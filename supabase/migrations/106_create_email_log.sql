-- Create email_log table for email deduplication and auditability
-- This table stores metadata about all emails sent by the system
-- It is used for:
-- 1. Preventing duplicate emails (deduplication via dedupe_key)
-- 2. Auditing email delivery and failures
-- 3. Tracking email history per user
--
-- IMPORTANT: This table is for internal logging & dedupe only, not end-user access.
-- All access is via service_role (backend-only).

CREATE TABLE IF NOT EXISTS lootaura_v2.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NULL REFERENCES lootaura_v2.profiles (id) ON DELETE SET NULL,
  email_type text NOT NULL, -- e.g. 'favorites_digest', 'seller_weekly', 'test_email'
  to_email text NOT NULL,
  subject text NOT NULL,
  dedupe_key text NULL, -- Optional unique key to prevent duplicates
  sent_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  delivery_status text NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'queued', etc.
  error_message text NULL, -- Truncated error detail if sending fails
  meta jsonb NOT NULL DEFAULT '{}'::jsonb, -- Additional metadata (non-PII)
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Create unique constraint on dedupe_key to prevent accidental duplicates
-- This allows NULL values (multiple NULLs are allowed in unique constraints)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_log_dedupe_key_unique 
  ON lootaura_v2.email_log(dedupe_key) 
  WHERE dedupe_key IS NOT NULL;

-- Index for efficient queries by profile, email type, and sent date
CREATE INDEX IF NOT EXISTS idx_email_log_profile_type_sent 
  ON lootaura_v2.email_log(profile_id, email_type, sent_at DESC)
  WHERE profile_id IS NOT NULL;

-- Index for dedupe lookups (profile + type + dedupe_key + recent sent_at)
CREATE INDEX IF NOT EXISTS idx_email_log_dedupe_lookup 
  ON lootaura_v2.email_log(profile_id, email_type, dedupe_key, sent_at DESC)
  WHERE profile_id IS NOT NULL AND dedupe_key IS NOT NULL;

-- Index for delivery status queries
CREATE INDEX IF NOT EXISTS idx_email_log_delivery_status 
  ON lootaura_v2.email_log(delivery_status, sent_at DESC);

-- Enable RLS (but deny all direct access - API uses service role)
ALTER TABLE lootaura_v2.email_log ENABLE ROW LEVEL SECURITY;

-- Deny everything by default (no anon/auth direct access)
-- Backend code will use service role to bypass RLS
CREATE POLICY "no_direct_access_email_log"
  ON lootaura_v2.email_log
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Grant service role access (for API routes and cron jobs)
GRANT ALL ON lootaura_v2.email_log TO service_role;

-- Add comment explaining the table's purpose
COMMENT ON TABLE lootaura_v2.email_log IS 
  'Internal logging table for email deduplication and auditability. Not accessible to end users.';

COMMENT ON COLUMN lootaura_v2.email_log.dedupe_key IS 
  'Optional unique key to prevent duplicate emails. Format: {profileId}:{emailType}:{date/period}';

COMMENT ON COLUMN lootaura_v2.email_log.delivery_status IS 
  'Status of email delivery: sent, failed, queued, etc.';

COMMENT ON COLUMN lootaura_v2.email_log.meta IS 
  'Additional metadata (non-PII) such as sale count, test flags, etc.';

