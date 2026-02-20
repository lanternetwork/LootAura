-- Grant INSERT and UPDATE permissions on lootaura_v2.sale_drafts to authenticated role
-- This allows authenticated users to insert and update drafts when RLS policies permit
-- RLS policies still enforce that users can only access their own drafts (user_id = auth.uid())
GRANT INSERT, UPDATE ON TABLE lootaura_v2.sale_drafts TO authenticated;
