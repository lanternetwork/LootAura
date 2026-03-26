-- 146_grant_sales_delete.sql
-- Grant DELETE permission on lootaura_v2.sales to authenticated role
-- This allows authenticated users to delete their own sales when RLS policies permit.
-- RLS policies on lootaura_v2.sales still enforce that only owners can delete their rows.

GRANT DELETE ON TABLE lootaura_v2.sales TO authenticated;

