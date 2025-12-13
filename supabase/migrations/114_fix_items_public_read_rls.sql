-- Fix items_public_read RLS policy to use SECURITY DEFINER function
-- This resolves the issue where items don't appear on sale detail pages for anonymous users
-- The EXISTS subquery in the original policy was failing due to nested RLS checks
--
-- Solution: Create a SECURITY DEFINER function that bypasses RLS to check sale visibility,
-- then update both sales_public_read and items_public_read policies to use it.

-- Step 1: Create SECURITY DEFINER function to check if a sale is publicly visible
-- This function encapsulates the complete public visibility rules:
-- - status IN ('published', 'active')
-- - moderation_status = 'visible' (or IS NULL for backwards compatibility)
-- - archived_at IS NULL
CREATE OR REPLACE FUNCTION lootaura_v2.is_sale_publicly_visible(sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, lootaura_v2
STABLE
AS $$
DECLARE
    sale_status text;
    sale_moderation_status text;
    sale_archived_at timestamptz;
BEGIN
    -- Query the sale directly (bypasses RLS due to SECURITY DEFINER)
    SELECT 
        s.status,
        COALESCE(s.moderation_status, 'visible') as moderation_status,
        s.archived_at
    INTO 
        sale_status,
        sale_moderation_status,
        sale_archived_at
    FROM lootaura_v2.sales s
    WHERE s.id = sale_id;
    
    -- Return false if sale not found
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check public visibility rules
    -- 1. Status must be 'published' or 'active'
    IF sale_status NOT IN ('published', 'active') THEN
        RETURN false;
    END IF;
    
    -- 2. Moderation status must be 'visible' (or NULL for backwards compatibility)
    IF sale_moderation_status != 'visible' THEN
        RETURN false;
    END IF;
    
    -- 3. Sale must not be archived
    IF sale_archived_at IS NOT NULL THEN
        RETURN false;
    END IF;
    
    -- All checks passed
    RETURN true;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) IS 
    'Returns true if a sale is publicly visible. Checks status IN (published, active), moderation_status = visible, and archived_at IS NULL. Uses SECURITY DEFINER to bypass RLS for the check. Used by RLS policies to determine item visibility.';

-- Step 2: Update sales_public_read policy to use the function
-- This ensures consistency between sales and items visibility
DROP POLICY IF EXISTS "sales_public_read" ON lootaura_v2.sales;

CREATE POLICY "sales_public_read" ON lootaura_v2.sales
    FOR SELECT
    USING (lootaura_v2.is_sale_publicly_visible(id));

-- Step 3: Update items_public_read policy to use the function
-- This fixes the nested RLS issue that was blocking items
DROP POLICY IF EXISTS "items_public_read" ON lootaura_v2.items;

CREATE POLICY "items_public_read" ON lootaura_v2.items
    FOR SELECT
    USING (lootaura_v2.is_sale_publicly_visible(sale_id));

-- Add comments for documentation
COMMENT ON POLICY "sales_public_read" ON lootaura_v2.sales IS 
    'Allows public read access to sales that are publicly visible (published/active, visible moderation status, not archived). Uses is_sale_publicly_visible() function for consistent visibility checks.';

COMMENT ON POLICY "items_public_read" ON lootaura_v2.items IS 
    'Allows public read access to items from sales that are publicly visible. Uses is_sale_publicly_visible() function to avoid nested RLS issues. Fixed in migration 114 to resolve items not appearing on sale detail pages.';

