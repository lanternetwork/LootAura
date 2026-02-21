-- Add WITH CHECK clause to sale_drafts UPDATE RLS policy
-- This closes a defense-in-depth gap by preventing users from updating a row
-- and setting user_id to another user's ID (even though API code doesn't allow this)
--
-- The existing policy only has USING (which controls which rows can be updated),
-- but is missing WITH CHECK (which controls what values can be set).
-- Adding WITH CHECK ensures that even if the API code changes, RLS will prevent
-- ownership transfer via UPDATE.

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "update own drafts" ON lootaura_v2.sale_drafts;

-- Recreate UPDATE policy with both USING and WITH CHECK
CREATE POLICY "update own drafts"
  ON lootaura_v2.sale_drafts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add comment explaining the policy
COMMENT ON POLICY "update own drafts" ON lootaura_v2.sale_drafts IS
  'Allows users to update only their own drafts. USING clause controls which rows can be updated (must be owned by current user). WITH CHECK clause ensures updated values maintain ownership (user_id cannot be changed to another user).';
