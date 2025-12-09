-- Create email_unsubscribe_tokens table for one-click unsubscribe functionality
-- This table stores secure tokens that allow users to unsubscribe from non-admin emails
-- without requiring authentication

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
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_token ON lootaura_v2.email_unsubscribe_tokens(token) 
WHERE used_at IS NULL AND expires_at >= now();

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


