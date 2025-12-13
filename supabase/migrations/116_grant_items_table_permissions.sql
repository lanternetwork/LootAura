-- Grant SELECT permissions on lootaura_v2.items base table to anon and authenticated roles
-- This is required for RLS policies to work - policies control which rows are visible,
-- but GRANT controls whether the role can access the table at all.
--
-- The application queries the base table directly via fromBase(db, 'items'), so we need
-- to grant permissions on the base table, not just the view.

-- Grant SELECT permission to anon and authenticated roles
-- This allows the roles to query the table, and RLS policies will filter the results
GRANT SELECT ON lootaura_v2.items TO anon, authenticated;

-- Also update the policy to explicitly specify TO clause (best practice)
-- This makes it clear which roles the policy applies to
DROP POLICY IF EXISTS "items_public_read" ON lootaura_v2.items;

CREATE POLICY "items_public_read" ON lootaura_v2.items
    FOR SELECT
    TO anon, authenticated
    USING (lootaura_v2.is_sale_publicly_visible(sale_id));

-- Update policy comment
COMMENT ON POLICY "items_public_read" ON lootaura_v2.items IS 
    'Allows public read access to items from sales that are publicly visible. Uses is_sale_publicly_visible() function to avoid nested RLS issues. Function matches sales_public_read policy exactly (status = published only). Explicitly grants to anon and authenticated roles.';

-- Add comment for documentation
COMMENT ON TABLE lootaura_v2.items IS 
    'Items table with RLS enabled. Public read via items_public_read policy (uses is_sale_publicly_visible function). Owner read via items_owner_read policy. SELECT permission granted to anon and authenticated roles.';

