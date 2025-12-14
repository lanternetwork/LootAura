-- Revoke anon SELECT on lootaura_v2.profiles base table
-- This reduces exposure of sensitive fields (lock fields, email prefs) to anonymous users
-- Public profile reads should use profiles_v2 view only, which filters sensitive columns
--
-- Context:
-- - Migration 117 added GRANT SELECT on base table to anon/authenticated
-- - This was needed for authenticated flows, but anon should not access base table
-- - Public profile endpoints now use profiles_v2 view only (no base table fallbacks)
--
-- Changes:
-- - Revoke anon SELECT on base table
-- - Leave authenticated SELECT/UPDATE grants intact
-- - Do not change RLS policies (profiles_public_read remains for authenticated users)

-- Revoke anon SELECT permission on base table
REVOKE SELECT ON lootaura_v2.profiles FROM anon;

-- Authenticated SELECT/UPDATE grants remain unchanged (from migration 089):
-- GRANT SELECT, UPDATE ON lootaura_v2.profiles TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE lootaura_v2.profiles IS 
    'Profiles table with RLS enabled. Anon users cannot SELECT base table (use profiles_v2 view). Authenticated users can SELECT/UPDATE their own profiles. Public profile reads use profiles_v2 view only.';

