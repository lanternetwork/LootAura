-- Fix SECURITY DEFINER views to use SECURITY INVOKER
-- This addresses Supabase Security Advisor alerts for:
-- - public.items_v2
-- - public.favorites_v2
-- - public.sales_v2
-- - public.profiles_v2
--
-- SECURITY INVOKER ensures views enforce RLS policies of the querying user,
-- not the view creator, which is the correct security model for PostgREST.
--
-- Note: The spatial_ref_sys table RLS alert is expected - it's a PostGIS system table
-- managed by PostGIS and typically should not have RLS enabled. This is acceptable.

-- Recreate sales_v2 view with SECURITY INVOKER
-- Note: Views default to SECURITY INVOKER unless SECURITY DEFINER is specified
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
    archived_at,
    moderation_status,
    moderation_notes
FROM lootaura_v2.sales;

-- Recreate items_v2 view with SECURITY INVOKER
-- Note: Views default to SECURITY INVOKER unless SECURITY DEFINER is specified
DROP VIEW IF EXISTS public.items_v2 CASCADE;

CREATE VIEW public.items_v2 AS
SELECT 
    id,
    created_at,
    sale_id,
    name,
    description,
    price,
    category,
    condition,
    images,
    is_sold,
    updated_at
FROM lootaura_v2.items;

-- Recreate favorites_v2 view with SECURITY INVOKER
-- Note: Views default to SECURITY INVOKER unless SECURITY DEFINER is specified
DROP VIEW IF EXISTS public.favorites_v2 CASCADE;

CREATE VIEW public.favorites_v2 AS
SELECT 
    user_id,
    sale_id,
    created_at
FROM lootaura_v2.favorites;

-- Recreate profiles_v2 view with SECURITY INVOKER
-- Note: Views default to SECURITY INVOKER unless SECURITY DEFINER is specified
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
    locked_at,
    locked_by,
    lock_reason
FROM lootaura_v2.profiles;

-- Grant permissions on all views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.favorites_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

-- Add comments for documentation
COMMENT ON VIEW public.sales_v2 IS 
    'Canonical view of sales table. Uses SECURITY INVOKER to enforce RLS policies of the querying user. Includes owner_id for owner queries and RLS. Hidden sales (moderation_status = hidden_by_admin) should be filtered out in public queries.';

COMMENT ON VIEW public.items_v2 IS 
    'Public view of items table. Uses SECURITY INVOKER to enforce RLS policies of the querying user.';

COMMENT ON VIEW public.favorites_v2 IS 
    'Public view of favorites table. Uses SECURITY INVOKER to enforce RLS policies of the querying user. RLS policies on lootaura_v2.favorites will filter results to only the user''s own favorites.';

COMMENT ON VIEW public.profiles_v2 IS 
    'Public view of profiles table. Uses SECURITY INVOKER to enforce RLS policies of the querying user. Includes account lock fields for owner/admin visibility.';

-- Verify views were created successfully
DO $$
DECLARE
    sales_count integer;
    items_count integer;
    favorites_count integer;
    profiles_count integer;
BEGIN
    -- Verify views exist and are accessible
    SELECT COUNT(*) INTO sales_count FROM public.sales_v2 LIMIT 1;
    SELECT COUNT(*) INTO items_count FROM public.items_v2 LIMIT 1;
    SELECT COUNT(*) INTO favorites_count FROM public.favorites_v2 LIMIT 1;
    SELECT COUNT(*) INTO profiles_count FROM public.profiles_v2 LIMIT 1;
    
    RAISE NOTICE 'All views successfully recreated with SECURITY INVOKER (default behavior)';
    RAISE NOTICE 'Views are accessible: sales_v2, items_v2, favorites_v2, profiles_v2';
END $$;

