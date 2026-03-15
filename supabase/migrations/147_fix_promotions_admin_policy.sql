-- 147_fix_promotions_admin_policy.sql
-- Restore promotions_admin_select policy on lootaura_v2.promotions to repo-intended definition.
-- The correct policy checks admin status via lootaura_v2.profiles, not auth.users.
-- This avoids requiring SELECT on auth.users for authenticated role.

-- Drop the drifted policy if it exists
DROP POLICY IF EXISTS promotions_admin_select ON lootaura_v2.promotions;

-- Recreate the admin SELECT policy using lootaura_v2.profiles and app.admin_emails
CREATE POLICY promotions_admin_select ON lootaura_v2.promotions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lootaura_v2.profiles
      WHERE id = auth.uid()
      AND email IN (
        SELECT unnest(
          string_to_array(current_setting('app.admin_emails', true), ',')
        )
      )
    )
  );

