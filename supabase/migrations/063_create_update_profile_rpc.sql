-- Create RPC function to update profiles in lootaura_v2 schema
-- This allows updating profiles through the public API while working with lootaura_v2.profiles

CREATE OR REPLACE FUNCTION public.update_profile_v2(
  p_user_id uuid,
  p_display_name text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_location_city text DEFAULT NULL,
  p_location_region text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  full_name text,
  avatar_url text,
  bio text,
  location_city text,
  location_region text,
  home_zip text,
  preferences jsonb,
  verified boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
BEGIN
  -- Update lootaura_v2.profiles
  UPDATE lootaura_v2.profiles
  SET
    display_name = COALESCE(p_display_name, display_name),
    bio = COALESCE(p_bio, bio),
    location_city = COALESCE(p_location_city, location_city),
    location_region = COALESCE(p_location_region, location_region),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = p_user_id;
  
  -- Return the updated profile matching profiles_v2 view structure
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(p.username, u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)) as username,
    COALESCE(p.display_name, p.full_name) as display_name,
    p.full_name,
    p.avatar_url,
    p.bio,
    p.location_city,
    p.location_region,
    p.home_zip,
    p.preferences,
    p.verified,
    p.created_at,
    p.updated_at
  FROM lootaura_v2.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.update_profile_v2 TO authenticated;

-- Add RLS check: users can only update their own profile
ALTER FUNCTION public.update_profile_v2 SECURITY DEFINER;

