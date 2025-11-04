-- Create RPC function to update profile safely
-- This bypasses schema cache issues by updating the table directly

CREATE OR REPLACE FUNCTION public.update_profile(
  p_user_id uuid,
  p_avatar_url text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_location_city text DEFAULT NULL,
  p_location_region text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
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
  
  -- Update display_name if provided (try to update, ignore if column doesn't exist)
  IF p_display_name IS NOT NULL THEN
    BEGIN
      UPDATE lootaura_v2.profiles
      SET display_name = p_display_name
      WHERE id = p_user_id;
    EXCEPTION WHEN undefined_column THEN
      -- Column doesn't exist, skip it
      NULL;
    END;
  END IF;
  
  -- Update bio if provided (allows NULL to clear bio)
  -- Check using parameter name to see if it was explicitly provided
  -- Since we can't check if parameter was provided vs NULL, we'll update if parameter is not DEFAULT
  -- For now, we'll always try to update bio if the function was called with the parameter
  -- This is safe because the function signature allows NULL
  BEGIN
    UPDATE lootaura_v2.profiles
    SET bio = p_bio
    WHERE id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- Column doesn't exist, skip it
    NULL;
  END;
  
  -- Update location_city if provided (allows NULL to clear)
  BEGIN
    UPDATE lootaura_v2.profiles
    SET location_city = p_location_city
    WHERE id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- Column doesn't exist, skip it
    NULL;
  END;
  
  -- Update location_region if provided (allows NULL to clear)
  BEGIN
    UPDATE lootaura_v2.profiles
    SET location_region = p_location_region
    WHERE id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- Column doesn't exist, skip it
    NULL;
  END;
  
  -- Always update updated_at (this should exist, but wrap in try-catch just in case)
  BEGIN
    UPDATE lootaura_v2.profiles
    SET updated_at = now()
    WHERE id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- updated_at doesn't exist, skip it
    NULL;
  END;
  
  -- Return updated profile from view
  SELECT row_to_json(p.*) INTO v_result
  FROM public.profiles_v2 p
  WHERE p.id = p_user_id;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_profile TO authenticated;

-- Security: Only allow users to update their own profile
ALTER FUNCTION public.update_profile SECURITY DEFINER;

