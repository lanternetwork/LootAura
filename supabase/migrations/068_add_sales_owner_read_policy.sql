-- Add RLS policy to allow owners to read their own sales (all statuses)
-- This is needed for the dashboard to show all user's sales, including drafts

-- Drop existing policy if it exists (in case we're re-running)
DROP POLICY IF EXISTS "sales_owner_read" ON lootaura_v2.sales;

-- Create policy: owners can read their own sales regardless of status
CREATE POLICY "sales_owner_read" ON lootaura_v2.sales
    FOR SELECT
    USING (auth.uid() = owner_id);

-- Grant comment
COMMENT ON POLICY "sales_owner_read" ON lootaura_v2.sales IS 
    'Allows owners to read their own sales regardless of status (for dashboard, drafts, etc.)';

