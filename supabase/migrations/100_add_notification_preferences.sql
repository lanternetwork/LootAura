-- 100_add_notification_preferences.sql
-- Add notification preference flags to profiles table
-- These flags control whether users receive specific email notifications
-- Defaults are true to preserve current behavior (opt-in by default)
--
-- Constraints:
-- - Idempotent: safe to run multiple times
-- - Forward-only: no destructive changes
-- - No RLS changes (uses existing profiles RLS)

-- Add notification preference columns to profiles table
DO $$
BEGIN
  -- Add email_favorites_digest_enabled column (default: true)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2'
      AND table_name = 'profiles'
      AND column_name = 'email_favorites_digest_enabled'
  ) THEN
    ALTER TABLE lootaura_v2.profiles
      ADD COLUMN email_favorites_digest_enabled boolean NOT NULL DEFAULT true;
    
    COMMENT ON COLUMN lootaura_v2.profiles.email_favorites_digest_enabled IS 
      'Controls whether user receives "favorite sale starting soon" digest emails. Default true to preserve current behavior.';
  END IF;

  -- Add email_seller_weekly_enabled column (default: true)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2'
      AND table_name = 'profiles'
      AND column_name = 'email_seller_weekly_enabled'
  ) THEN
    ALTER TABLE lootaura_v2.profiles
      ADD COLUMN email_seller_weekly_enabled boolean NOT NULL DEFAULT true;
    
    COMMENT ON COLUMN lootaura_v2.profiles.email_seller_weekly_enabled IS 
      'Controls whether user receives weekly seller analytics emails. Default true to preserve current behavior.';
  END IF;
END
$$;

