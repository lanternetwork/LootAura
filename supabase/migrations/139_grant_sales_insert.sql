-- Grant INSERT permission on lootaura_v2.sales to authenticated role
-- This allows authenticated users to insert sales when RLS policies permit
-- RLS policy sales_owner_insert still enforces that owner_id = auth.uid()
GRANT INSERT ON TABLE lootaura_v2.sales TO authenticated;
