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
  v_update_data jsonb := '{}'::jsonb;
  v_result jsonb;
BEGIN
  -- Build update data dynamically, only including fields that are provided
  IF p_avatar_url IS NOT NULL THEN
    v_update_data := v_update_data || jsonb_build_object('avatar_url', p_avatar_url);
  END IF;
  
  IF p_full_name IS NOT NULL THEN
    v_update_data := v_update_data || jsonb_build_object('full_name', p_full_name);
  END IF;
  
  IF p_display_name IS NOT NULL THEN
    v_update_data := v_update_data || jsonb_build_object('display_name', p_display_name);
  END IF;
  
  IF p_bio IS NOT NULL OR p_bio IS NULL AND p_bio IS DISTINCT FROM NULL THEN
    v_update_data := v_update_data || jsonb_build_object('bio', p_bio);
  END IF;
  
  IF p_location_city IS NOT NULL OR p_location_city IS NULL AND p_location_city IS DISTINCT FROM NULL THEN
    v_update_data := v_update_data || jsonb_build_object('location_city', p_location_city);
  END IF;
  
  IF p_location_region IS NOT NULL OR p_location_region IS NULL AND p_location_region IS DISTINCT FROM NULL THEN
    v_update_data := v_update_data || jsonb_build_object('location_region', p_location_region);
  END IF;
  
  -- Always update updated_at
  v_update_data := v_update_data || jsonb_build_object('updated_at', now());
  
  -- Update the profile table directly
  UPDATE lootaura_v2.profiles
  SET
    avatar_url = COALESCE((v_update_data->>'avatar_url')::text, avatar_url),
    full_name = COALESCE((v_update_data->>'full_name')::text, full_name),
    display_name = COALESCE((v_update_data->>'display_name')::text, display_name),
    bio = CASE 
      WHEN v_update_data ? 'bio' THEN (v_update_data->>'bio')::text
      ELSE bio
    END,
    location_city = CASE 
      WHEN v_update_data ? 'location_city' THEN (v_update_data->>'location_city')::text
      ELSE location_city
    END,
    location_region = CASE 
      WHEN v_update_data ? 'location_region' THEN (v_update_data->>'location_region')::text
      ELSE location_region
    END,
    updated_at = now()
  WHERE id = p_user_id;
  
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

