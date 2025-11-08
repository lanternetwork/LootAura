-- Update profiles_v2 view to include bio, location fields, and display_name
-- This migration ensures the view exposes all fields needed by the profile pages

-- First ensure bio, display_name, location_city, location_region, verified columns exist in lootaura_v2.profiles
DO $$ 
BEGIN
    -- Add display_name if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'display_name'
    ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN display_name text;
    END IF;
    
    -- Add bio if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'bio'
    ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN bio text;
    END IF;
    
    -- Add location_city if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'location_city'
    ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN location_city text;
    END IF;
    
    -- Add location_region if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'location_region'
    ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN location_region text;
    END IF;
    
    -- Add verified if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'verified'
    ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN verified boolean DEFAULT false;
    END IF;
END $$;

-- Drop and recreate the view with all necessary columns
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
    updated_at
FROM lootaura_v2.profiles;

-- Grant permissions on the view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

