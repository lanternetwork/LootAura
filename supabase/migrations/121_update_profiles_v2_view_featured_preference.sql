-- 121_update_profiles_v2_view_featured_preference.sql
-- Update profiles_v2 view to include email_featured_weekly_enabled column
-- This column was added in migration 119_add_featured_email_foundations.sql

-- Recreate public view to include featured weekly email preference
DROP VIEW IF EXISTS public.profiles_v2 CASCADE;

CREATE VIEW public.profiles_v2 AS
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
    email_featured_weekly_enabled
FROM lootaura_v2.profiles;

-- Grant permissions on the view (consistent with previous migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

