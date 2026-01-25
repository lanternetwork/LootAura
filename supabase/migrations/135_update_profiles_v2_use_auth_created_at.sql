-- Update profiles_v2 view to use member_since field for created_at
-- This ensures "Member since" reflects account creation time, not profile row creation time
-- 
-- Step 1: Add member_since column to profiles table
-- Step 2: Backfill member_since from auth.users.created_at (one-time)
-- Step 3: Update profiles_v2 view to use member_since

-- Step 1: Add member_since column to lootaura_v2.profiles
ALTER TABLE lootaura_v2.profiles 
ADD COLUMN IF NOT EXISTS member_since TIMESTAMPTZ;

-- Step 2: Backfill member_since from auth.users.created_at
-- This is a one-time migration that populates the column from auth.users
-- Only update rows where member_since is NULL to avoid overwriting existing data
-- Note: This UPDATE runs in the migration context (service role) so it can access auth.users
UPDATE lootaura_v2.profiles p
SET member_since = u.created_at
FROM auth.users u
WHERE p.id = u.id 
  AND p.member_since IS NULL;

-- Step 3: Update profiles_v2 view to use member_since for created_at
DROP VIEW IF EXISTS public.profiles_v2 CASCADE;

CREATE VIEW public.profiles_v2
WITH (security_invoker = true) AS
SELECT 
    p.id,
    p.username,
    COALESCE(p.display_name, p.full_name) as display_name,
    p.full_name,
    p.avatar_url,
    p.bio,
    p.location_city,
    p.location_region,
    p.home_zip,
    p.preferences,
    p.verified,
    p.member_since as created_at,  -- Use member_since (account creation time from auth.users)
    p.updated_at,
    p.social_links,
    p.email_favorites_digest_enabled,
    p.email_seller_weekly_enabled,
    p.email_featured_weekly_enabled,
    p.is_locked,
    p.locked_at,
    p.locked_by,
    p.lock_reason
FROM lootaura_v2.profiles p;

-- Grant permissions on the view (consistent with previous migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

COMMENT ON COLUMN lootaura_v2.profiles.member_since IS 
    'Account creation timestamp, backfilled from auth.users.created_at. Used by profiles_v2 view for "Member since" display.';

COMMENT ON VIEW public.profiles_v2 IS 
    'Public view of profiles table. Uses SECURITY INVOKER to enforce RLS policies of the querying user. Email preferences are included but protected by RLS (users can only read their own preferences). The created_at field reflects account creation time from member_since column, which is backfilled from auth.users.created_at.';
