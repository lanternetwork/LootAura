-- Apply missing pre-moderation migrations (103, 105, 106)
-- Migration 104 is already applied (profiles_v2 view exists)

-- ============================================================================
-- MIGRATION 103: Add archived_at to sales table
-- ============================================================================

-- Add archived_at column
ALTER TABLE IF EXISTS lootaura_v2.sales
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- Add index for efficient queries on archived sales with date filtering
CREATE INDEX IF NOT EXISTS idx_sales_archived_at ON lootaura_v2.sales(archived_at) 
WHERE archived_at IS NOT NULL;

-- Add index for efficient queries filtering by status and end_date (for auto-archive job)
CREATE INDEX IF NOT EXISTS idx_sales_status_end_date ON lootaura_v2.sales(status, date_end) 
WHERE status IN ('published', 'active');

-- Update sales_v2 view to include archived_at
-- Note: This will drop and recreate the view, so any dependent views will need to be recreated
-- Using cover_image_url and images (not cover_url/tags) to match actual schema
DROP VIEW IF EXISTS public.sales_v2 CASCADE;

CREATE VIEW public.sales_v2 AS
SELECT 
    id,
    created_at,
    updated_at,
    owner_id,
    title,
    description,
    address,
    city,
    state,
    zip_code,
    lat,
    lng,
    geom,
    date_start,
    time_start,
    date_end,
    time_end,
    starts_at,
    status,
    is_featured,
    pricing_mode,
    privacy_mode,
    cover_image_url,
    images,
    archived_at
FROM lootaura_v2.sales;

-- Grant permissions on view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

-- ============================================================================
-- MIGRATION 105: Create email_unsubscribe_tokens table
-- ============================================================================

CREATE TABLE IF NOT EXISTS lootaura_v2.email_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES lootaura_v2.profiles (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  scope text NOT NULL DEFAULT 'all_non_admin',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL, -- Set to now() + interval '30 days' when inserting
  used_at timestamptz NULL
);

-- Create index for efficient token lookups
-- Note: Cannot use now() in index predicate (not immutable), so we index all unused tokens
-- The application logic will filter by expires_at >= now() at query time
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_token ON lootaura_v2.email_unsubscribe_tokens(token) 
WHERE used_at IS NULL;

-- Create index for profile lookups (for cleanup/management)
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_profile_id ON lootaura_v2.email_unsubscribe_tokens(profile_id);

-- Enable RLS (but deny all direct access - API uses service role)
ALTER TABLE lootaura_v2.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

-- Deny everything by default (no anon/auth direct access)
-- API routes will use service role to bypass RLS
CREATE POLICY "no_direct_access_email_unsub_tokens"
  ON lootaura_v2.email_unsubscribe_tokens
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Grant service role access (for API routes)
GRANT ALL ON lootaura_v2.email_unsubscribe_tokens TO service_role;

-- ============================================================================
-- MIGRATION 106: Create email_log table
-- ============================================================================

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

-- Add comments explaining the table's purpose
COMMENT ON TABLE lootaura_v2.email_log IS 
  'Internal logging table for email deduplication and auditability. Not accessible to end users.';

COMMENT ON COLUMN lootaura_v2.email_log.dedupe_key IS 
  'Optional unique key to prevent duplicate emails. Format: {profileId}:{emailType}:{date/period}';

COMMENT ON COLUMN lootaura_v2.email_log.delivery_status IS 
  'Status of email delivery: sent, failed, queued, etc.';

COMMENT ON COLUMN lootaura_v2.email_log.meta IS 
  'Additional metadata (non-PII) such as sale count, test flags, etc.';

