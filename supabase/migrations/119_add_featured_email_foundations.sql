-- 119_add_featured_email_foundations.sql
-- Milestone 2: Data foundations for Weekly Featured Sales
-- 
-- This migration adds:
-- 1. profile_zip_usage table for tracking most-used ZIP codes per user
-- 2. email_featured_weekly_enabled column in profiles (default ON)
--
-- Constraints:
-- - Idempotent: safe to run multiple times
-- - Forward-only: no destructive changes
-- - RLS enabled with proper policies

-- ============================================================================
-- PART 1: Profile ZIP Usage Tracking
-- ============================================================================

-- Create profile_zip_usage table
CREATE TABLE IF NOT EXISTS lootaura_v2.profile_zip_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES lootaura_v2.profiles(id) ON DELETE CASCADE,
  zip text NOT NULL,
  use_count int NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT unique_profile_zip UNIQUE (profile_id, zip)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_profile_zip_usage_profile_id 
  ON lootaura_v2.profile_zip_usage(profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_zip_usage_zip 
  ON lootaura_v2.profile_zip_usage(zip);

-- Index for primary ZIP selection (max use_count, tie-break by last_seen_at)
CREATE INDEX IF NOT EXISTS idx_profile_zip_usage_primary_lookup 
  ON lootaura_v2.profile_zip_usage(profile_id, use_count DESC, last_seen_at DESC);

-- Enable RLS
ALTER TABLE lootaura_v2.profile_zip_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read/write their own ZIP usage rows
DROP POLICY IF EXISTS profile_zip_usage_owner_access ON lootaura_v2.profile_zip_usage;
CREATE POLICY profile_zip_usage_owner_access ON lootaura_v2.profile_zip_usage
  FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

COMMENT ON POLICY profile_zip_usage_owner_access ON lootaura_v2.profile_zip_usage IS 
  'Allows authenticated users to read/write their own ZIP usage rows only. Admin access via service_role.';

-- Grant service_role full access (for admin operations and background jobs)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lootaura_v2.profile_zip_usage TO service_role;

-- ============================================================================
-- PART 2: Weekly Featured Email Preference
-- ============================================================================

-- Add email_featured_weekly_enabled column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2'
      AND table_name = 'profiles'
      AND column_name = 'email_featured_weekly_enabled'
  ) THEN
    ALTER TABLE lootaura_v2.profiles
      ADD COLUMN email_featured_weekly_enabled boolean NOT NULL DEFAULT true;
    
    COMMENT ON COLUMN lootaura_v2.profiles.email_featured_weekly_enabled IS 
      'Controls whether user receives weekly featured sales emails. Default true (ON by default).';
  END IF;
END
$$;

