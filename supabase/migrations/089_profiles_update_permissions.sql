-- 089_profiles_update_permissions.sql
-- Ensure authenticated users can update their own profile rows in lootaura_v2.profiles
-- while keeping RLS "owner-only" guarantees in place.
--
-- Context:
-- - RLS is already enabled on lootaura_v2.profiles and policy "profiles_owner_update"
--   enforces auth.uid() = id for UPDATE.
-- - However, the authenticated role did not have sufficient table-level privileges,
--   leading to Postgres error 42501 (insufficient_privilege) on UPDATE attempts.
--
-- This migration grants the minimal required privileges to the authenticated role.

-- Ensure RLS remains enabled (idempotent)
ALTER TABLE lootaura_v2.profiles ENABLE ROW LEVEL SECURITY;

-- Grant SELECT/UPDATE on the base table to authenticated users.
-- RLS policies still control *which* rows can be updated (owner-only).
GRANT SELECT, UPDATE ON lootaura_v2.profiles TO authenticated;



