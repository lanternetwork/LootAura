-- Fix items_public_read RLS policy to use SECURITY DEFINER function
-- This resolves the issue where items don't appear on sale detail pages for anonymous users
-- The EXISTS subquery in the original policy was failing due to nested RLS checks
--
-- Solution: Create a SECURITY DEFINER function that bypasses RLS to check sale visibility,
-- then update items_public_read policy to use it. The sales_public_read policy remains unchanged.

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

-- Step 1.5: Harden function EXECUTE privileges
-- REVOKE default PUBLIC execute permission (security best practice for SECURITY DEFINER functions)
REVOKE EXECUTE ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) FROM PUBLIC;

-- GRANT execute permission only to roles that need it for RLS policies
-- anon and authenticated roles need this for RLS policy evaluation
GRANT EXECUTE ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) TO anon, authenticated;

-- Step 2: DO NOT update sales_public_read policy
-- The existing sales_public_read policy (status = 'published') remains unchanged.
-- This migration only fixes items_public_read to resolve the nested RLS issue.
-- Note: The function allows both 'published' and 'active' to match application code expectations,
-- but the sales_public_read policy remains as-is (status = 'published' only) to avoid breaking changes.
-- If sales_public_read needs to be updated to include 'active' and moderation checks, that should
-- be done in a separate migration after verifying the items fix works correctly.

-- Step 3: Update items_public_read policy to use the function
-- This fixes the nested RLS issue that was blocking items
DROP POLICY IF EXISTS "items_public_read" ON lootaura_v2.items;

CREATE POLICY "items_public_read" ON lootaura_v2.items
    FOR SELECT
    USING (lootaura_v2.is_sale_publicly_visible(sale_id));

-- Add comment for documentation
COMMENT ON POLICY "items_public_read" ON lootaura_v2.items IS 
    'Allows public read access to items from sales that are publicly visible. Uses is_sale_publicly_visible() function to avoid nested RLS issues. Fixed in migration 114 to resolve items not appearing on sale detail pages.';

