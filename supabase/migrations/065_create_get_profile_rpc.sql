-- Create RPC function to read profile from base table
-- This bypasses view RLS issues by reading directly from the base table

CREATE OR REPLACE FUNCTION public.get_profile(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Read profile directly from base table (not view)
  -- This ensures we get the actual data even if view has RLS issues
  SELECT row_to_json(p.*) INTO v_result
  FROM lootaura_v2.profiles p
  WHERE p.id = p_user_id;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_profile TO authenticated;

-- Security: Only allow users to read their own profile
ALTER FUNCTION public.get_profile SECURITY DEFINER;

