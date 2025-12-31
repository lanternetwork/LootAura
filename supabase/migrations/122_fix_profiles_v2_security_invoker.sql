-- 122_fix_profiles_v2_security_invoker.sql
-- Fix profiles_v2 view to use SECURITY INVOKER (consistent with migration 112)
-- This ensures RLS policies are properly enforced
-- 
-- Note: Email preferences (email_featured_weekly_enabled, etc.) are exposed in the view
-- but protected by RLS on the base table. Anon users can only read their own preferences
-- via RLS, but the view structure allows this. This is consistent with existing
-- email_favorites_digest_enabled and email_seller_weekly_enabled exposure.

-- Recreate profiles_v2 view with SECURITY INVOKER
DROP VIEW IF EXISTS public.profiles_v2 CASCADE;

CREATE VIEW public.profiles_v2
WITH (security_invoker = true) AS
SELECT 
    id,
    username,
    COALESCE(display_name, full_name) as display_name,
    full_name,
    avatar_url,
    bio,
    location_city,
    location_region,
    home_zip,
    preferences,
    verified,
    created_at,
    updated_at,
    social_links,
    email_favorites_digest_enabled,
    email_seller_weekly_enabled,
    email_featured_weekly_enabled,
    is_locked,
    locked_at,
    locked_by,
    lock_reason
FROM lootaura_v2.profiles;

-- Grant permissions on the view (consistent with previous migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

COMMENT ON VIEW public.profiles_v2 IS 
    'Public view of profiles table. Uses SECURITY INVOKER to enforce RLS policies of the querying user. Email preferences are included but protected by RLS (users can only read their own preferences).';

