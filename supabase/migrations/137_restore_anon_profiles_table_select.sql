-- Restore table-level SELECT on lootaura_v2.profiles to anon role
-- This is required for profiles_v2 view (SECURITY INVOKER) to work for anonymous users
-- 
-- Context:
-- - Migration 118 revoked anon SELECT on base table for security
-- - Migration 136 attempted column-level grants, but these are insufficient
-- - SECURITY INVOKER views require table-level SELECT permission on underlying table
-- - RLS policies (profiles_public_read) already safely control row visibility
-- - This restores the permission needed for the view to function correctly

-- Grant table-level SELECT on lootaura_v2.profiles to anon
-- This allows anonymous users to read through profiles_v2 view
-- RLS policy profiles_public_read (USING true) already controls row visibility
GRANT SELECT ON lootaura_v2.profiles TO anon;

COMMENT ON TABLE lootaura_v2.profiles IS 
    'Profiles table with RLS enabled. Anon users can SELECT base table (required for profiles_v2 SECURITY INVOKER view). Authenticated users can SELECT/UPDATE their own profiles. RLS policy profiles_public_read controls row visibility for all users.';
