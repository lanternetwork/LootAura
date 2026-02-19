-- Grant INSERT permission on lootaura_v2.items to authenticated role
-- This allows authenticated users to insert items when RLS policies permit
-- RLS policy items_owner_insert still enforces that the sale belongs to the user via is_sale_owned_by_user()
GRANT INSERT ON TABLE lootaura_v2.items TO authenticated;
