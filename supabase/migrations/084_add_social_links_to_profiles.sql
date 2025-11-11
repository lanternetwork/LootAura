-- 084_add_social_links_to_profiles.sql
-- Add social_links JSONB column to profiles table and update view

-- 1) Add JSONB column for social links on base table
ALTER TABLE lootaura_v2.profiles
ADD COLUMN IF NOT EXISTS social_links JSONB
  CHECK (jsonb_typeof(social_links) = 'object' OR social_links IS NULL)
  DEFAULT '{}'::jsonb;

COMMENT ON COLUMN lootaura_v2.profiles.social_links IS
  'Object of provider → canonical URL, e.g. {"twitter":"https://twitter.com/handle", "website":"https://example.com"}';

-- 2) Recreate public view to include social_links
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
    social_links  -- expose
FROM lootaura_v2.profiles;

-- Grant permissions on the view
GRANT SELECT ON public.profiles_v2 TO anon, authenticated;

-- RLS update policy already exists from 047_rls_hardening.sql
-- It uses: USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
-- No need to recreate it

