-- Grant column-level SELECT access on member_since to anon and authenticated roles
-- This ensures anonymous users can read the member_since column through the profiles_v2 view
-- The view grants SELECT on the view itself, but the underlying table column also needs explicit grants

-- Grant SELECT on member_since column to anon and authenticated
GRANT SELECT (member_since) ON lootaura_v2.profiles TO anon, authenticated;

COMMENT ON COLUMN lootaura_v2.profiles.member_since IS 
    'Account creation timestamp, backfilled from auth.users.created_at. Used by profiles_v2 view for "Member since" display. Column-level SELECT granted to anon and authenticated roles.';
