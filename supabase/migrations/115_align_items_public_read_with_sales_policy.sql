-- Align items_public_read RLS function with sales_public_read policy exactly
-- This fixes the mismatch where the function checked moderation_status and archived_at
-- but sales_public_read policy only checks status = 'published'
--
-- CRITICAL: This function MUST match sales_public_read policy predicate exactly.
-- If sales_public_read is updated to include moderation_status/archived_at checks,
-- this function must be updated in a separate migration to match.

-- Step 1: Update SECURITY DEFINER function to match sales_public_read policy exactly
-- Current sales_public_read policy: status = 'published' only
-- This function now ONLY checks status = 'published' (no moderation_status, no archived_at)
CREATE OR REPLACE FUNCTION lootaura_v2.is_sale_publicly_visible(sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, pg_catalog
STABLE
AS $$
DECLARE
    sale_status text;
BEGIN
    -- Query the sale directly (bypasses RLS due to SECURITY DEFINER)
    -- Uses schema-qualified table name for safety
    SELECT s.status
    INTO sale_status
    FROM lootaura_v2.sales s
    WHERE s.id = sale_id;
    
    -- Return false if sale not found
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check public visibility rules (matches sales_public_read policy EXACTLY)
    -- ONLY check status = 'published' to match current sales_public_read policy
    -- Do NOT check moderation_status or archived_at - those are not in sales_public_read
    IF sale_status != 'published' THEN
        RETURN false;
    END IF;
    
    -- All checks passed
    RETURN true;
END;
$$;

-- Update comment to reflect exact alignment
COMMENT ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) IS 
    'Returns true if a sale is publicly visible. Checks ONLY status = published to match sales_public_read policy exactly. Uses SECURITY DEFINER to bypass RLS for the check. Used by items_public_read RLS policy to determine item visibility.';

-- Step 2: Ensure function EXECUTE privileges are hardened
-- REVOKE default PUBLIC execute permission (security best practice for SECURITY DEFINER functions)
REVOKE EXECUTE ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) FROM PUBLIC;

-- GRANT execute permission only to roles that need it for RLS policies
-- anon and authenticated roles need this for RLS policy evaluation
GRANT EXECUTE ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) TO anon, authenticated;

-- Step 3: Verify items_public_read policy is using the function
-- (Policy should already exist from migration 114, but ensure it's correct)
DROP POLICY IF EXISTS "items_public_read" ON lootaura_v2.items;

CREATE POLICY "items_public_read" ON lootaura_v2.items
    FOR SELECT
    USING (lootaura_v2.is_sale_publicly_visible(sale_id));

-- Update policy comment
COMMENT ON POLICY "items_public_read" ON lootaura_v2.items IS 
    'Allows public read access to items from sales that are publicly visible. Uses is_sale_publicly_visible() function to avoid nested RLS issues. Function matches sales_public_read policy exactly (status = published only). Fixed in migration 115 to align with sales_public_read policy.';

