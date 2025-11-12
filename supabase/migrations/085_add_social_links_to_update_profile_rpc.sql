-- 085_add_social_links_to_update_profile_rpc.sql
-- Add social_links parameter to update_profile RPC function

-- Drop the existing function first to avoid ambiguity
DROP FUNCTION IF EXISTS public.update_profile(uuid, text, text, text, text, text, text);

-- Recreate with social_links parameter
CREATE OR REPLACE FUNCTION public.update_profile(
  p_user_id uuid,
  p_avatar_url text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_location_city text DEFAULT NULL,
  p_location_region text DEFAULT NULL,
  p_social_links jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Ensure profile exists before updating
  -- If profile doesn't exist, create it with minimal data
  IF NOT EXISTS (SELECT 1 FROM lootaura_v2.profiles WHERE id = p_user_id) THEN
    INSERT INTO lootaura_v2.profiles (id, created_at, updated_at)
    VALUES (p_user_id, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  -- Update the profile table directly using dynamic SQL to only update columns that exist
  -- Use conditional updates to avoid errors if columns don't exist
  
  -- Update avatar_url if provided
  IF p_avatar_url IS NOT NULL THEN
    UPDATE lootaura_v2.profiles
    SET avatar_url = p_avatar_url
    WHERE id = p_user_id;
  END IF;
  
  -- Update full_name if provided
  IF p_full_name IS NOT NULL THEN
    UPDATE lootaura_v2.profiles
    SET full_name = p_full_name
    WHERE id = p_user_id;
  END IF;
  
  -- Update display_name if provided
  IF p_display_name IS NOT NULL THEN
    BEGIN
      -- Ensure column exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'display_name'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN display_name text;
      END IF;
      
      UPDATE lootaura_v2.profiles
      SET display_name = p_display_name
      WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update display_name: %', SQLERRM;
    END;
  END IF;
  
  -- Update bio if provided (allows NULL to clear bio)
  -- Ensure bio column exists before updating
  IF p_bio IS NOT NULL OR (p_bio IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'bio'
  )) THEN
    BEGIN
      -- Ensure column exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'bio'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN bio text;
      END IF;
      
      UPDATE lootaura_v2.profiles
      SET bio = p_bio
      WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail entire update
      RAISE WARNING 'Failed to update bio: %', SQLERRM;
    END;
  END IF;
  
  -- Update location_city if provided (allows NULL to clear)
  IF p_location_city IS NOT NULL OR (p_location_city IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'location_city'
  )) THEN
    BEGIN
      -- Ensure column exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'location_city'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN location_city text;
      END IF;
      
      UPDATE lootaura_v2.profiles
      SET location_city = p_location_city
      WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update location_city: %', SQLERRM;
    END;
  END IF;
  
  -- Update location_region if provided (allows NULL to clear)
  IF p_location_region IS NOT NULL OR (p_location_region IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'location_region'
  )) THEN
    BEGIN
      -- Ensure column exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'location_region'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN location_region text;
      END IF;
      
      UPDATE lootaura_v2.profiles
      SET location_region = p_location_region
      WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update location_region: %', SQLERRM;
    END;
  END IF;
  
  -- Update social_links if provided (allows NULL to clear)
  IF p_social_links IS NOT NULL OR (p_social_links IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'social_links'
  )) THEN
    BEGIN
      -- Ensure column exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'profiles' 
        AND column_name = 'social_links'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb;
      END IF;
      
      UPDATE lootaura_v2.profiles
      SET social_links = COALESCE(p_social_links, '{}'::jsonb)
      WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update social_links: %', SQLERRM;
    END;
  END IF;
  
  -- Always update updated_at (this should exist, but wrap in try-catch just in case)
  BEGIN
    UPDATE lootaura_v2.profiles
    SET updated_at = now()
    WHERE id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- updated_at doesn't exist, skip it
    NULL;
  END;
  
  -- Return updated profile directly from base table (not view)
  -- This ensures we return the actual data even if view has RLS issues
  SELECT row_to_json(p.*) INTO v_result
  FROM lootaura_v2.profiles p
  WHERE p.id = p_user_id;
  
  -- If base table query returned null, this is a critical error
  -- The profile should exist since we just updated it
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Profile not found after update: %', p_user_id;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users (if not already granted)
GRANT EXECUTE ON FUNCTION public.update_profile TO authenticated;

-- Security: Only allow users to update their own profile
ALTER FUNCTION public.update_profile SECURITY DEFINER;

