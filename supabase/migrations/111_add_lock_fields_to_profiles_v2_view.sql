-- Add account lock fields to profiles_v2 view
-- These fields were added to the base table in migration 108_add_account_lock_fields.sql

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
    is_locked,
    lock_reason
FROM lootaura_v2.profiles;

-- Grant permissions on the view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

COMMENT ON VIEW public.profiles_v2 IS
    'Public view of profiles table. Includes account lock fields for owner/admin visibility.';

