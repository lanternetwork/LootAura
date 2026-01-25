-- Update profiles_v2 view to use auth.users.created_at for created_at field
-- This ensures "Member since" reflects account creation time, not profile row creation time
-- 
-- The view will LEFT JOIN with auth.users to access the account creation timestamp
-- This is more accurate for displaying when a user joined the platform

-- Recreate profiles_v2 view with auth.users.created_at
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
    u.created_at as created_at,  -- Use auth.users.created_at (account creation time)
    p.updated_at,
    p.social_links,
    p.email_favorites_digest_enabled,
    p.email_seller_weekly_enabled,
    p.email_featured_weekly_enabled,
    p.is_locked,
    p.locked_at,
    p.locked_by,
    p.lock_reason
FROM lootaura_v2.profiles p
LEFT JOIN auth.users u ON p.id = u.id;

-- Grant permissions on the view (consistent with previous migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

COMMENT ON VIEW public.profiles_v2 IS 
    'Public view of profiles table. Uses SECURITY INVOKER to enforce RLS policies of the querying user. Email preferences are included but protected by RLS (users can only read their own preferences). The created_at field reflects account creation time from auth.users, not profile row creation time.';
