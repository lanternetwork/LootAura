-- Add owner read policy for items
-- This allows owners to read items from their own sales regardless of sale status
-- This fixes the issue where items don't appear immediately after creation due to RLS timing

-- Owner can read items from their own sales (regardless of sale status)
CREATE POLICY "items_owner_read" ON lootaura_v2.items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    );

-- Add comment for documentation
COMMENT ON POLICY "items_owner_read" ON lootaura_v2.items IS 
    'Allows owners to read items from their own sales, regardless of sale status. This ensures owners can see their items immediately after creation.';

