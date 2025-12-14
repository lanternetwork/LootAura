-- Security Hardening: RLS Policy Hardening
-- Pre-merge security pass to eliminate RLS fragility and permission ambiguity
--
-- This migration:
-- 1. Creates SECURITY DEFINER function for owner checks (eliminates nested RLS issues)
-- 2. Updates items owner policies to use the function
-- 3. Adds explicit TO clauses to all RLS policies for clarity and security
-- 4. Adds missing GRANT for profiles base table (queried directly by application)
--
-- All changes are idempotent and preserve existing behavior.

-- ============================================================================
-- PART 1: OWNER ACCESS HARDENING
-- ============================================================================

-- Create SECURITY DEFINER function to check if a sale is owned by the current user
-- This eliminates nested RLS issues in EXISTS subqueries
CREATE OR REPLACE FUNCTION lootaura_v2.is_sale_owned_by_user(sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, pg_catalog
STABLE
AS $$
DECLARE
    sale_owner_id uuid;
BEGIN
    -- Query the sale directly (bypasses RLS due to SECURITY DEFINER)
    -- Uses schema-qualified table name for safety
    SELECT s.owner_id
    INTO sale_owner_id
    FROM lootaura_v2.sales s
    WHERE s.id = sale_id;
    
    -- Return false if sale not found
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check if the sale owner matches the current authenticated user
    -- auth.uid() is evaluated in the context of the calling user (not DEFINER)
    RETURN sale_owner_id = auth.uid();
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION lootaura_v2.is_sale_owned_by_user(uuid) IS 
    'Returns true if a sale is owned by the current authenticated user. Uses SECURITY DEFINER to bypass RLS for the check. Used by items owner RLS policies to avoid nested RLS issues.';

-- Harden function EXECUTE privileges
REVOKE EXECUTE ON FUNCTION lootaura_v2.is_sale_owned_by_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lootaura_v2.is_sale_owned_by_user(uuid) TO authenticated;

-- Update items_owner_read policy to use the function
DROP POLICY IF EXISTS "items_owner_read" ON lootaura_v2.items;

CREATE POLICY "items_owner_read" ON lootaura_v2.items
    FOR SELECT
    TO authenticated
    USING (lootaura_v2.is_sale_owned_by_user(sale_id));

COMMENT ON POLICY "items_owner_read" ON lootaura_v2.items IS 
    'Allows owners to read items from their own sales, regardless of sale status. Uses is_sale_owned_by_user() function to avoid nested RLS issues.';

-- Update items_owner_insert policy to use the function
DROP POLICY IF EXISTS "items_owner_insert" ON lootaura_v2.items;

CREATE POLICY "items_owner_insert" ON lootaura_v2.items
    FOR INSERT
    TO authenticated
    WITH CHECK (lootaura_v2.is_sale_owned_by_user(sale_id));

COMMENT ON POLICY "items_owner_insert" ON lootaura_v2.items IS 
    'Allows owners to insert items for their own sales. Uses is_sale_owned_by_user() function to avoid nested RLS issues.';

-- Update items_owner_update policy to use the function
DROP POLICY IF EXISTS "items_owner_update" ON lootaura_v2.items;

CREATE POLICY "items_owner_update" ON lootaura_v2.items
    FOR UPDATE
    TO authenticated
    USING (lootaura_v2.is_sale_owned_by_user(sale_id))
    WITH CHECK (lootaura_v2.is_sale_owned_by_user(sale_id));

COMMENT ON POLICY "items_owner_update" ON lootaura_v2.items IS 
    'Allows owners to update items for their own sales. Uses is_sale_owned_by_user() function to avoid nested RLS issues.';

-- Update items_owner_delete policy to use the function
DROP POLICY IF EXISTS "items_owner_delete" ON lootaura_v2.items;

CREATE POLICY "items_owner_delete" ON lootaura_v2.items
    FOR DELETE
    TO authenticated
    USING (lootaura_v2.is_sale_owned_by_user(sale_id));

COMMENT ON POLICY "items_owner_delete" ON lootaura_v2.items IS 
    'Allows owners to delete items from their own sales. Uses is_sale_owned_by_user() function to avoid nested RLS issues.';

-- ============================================================================
-- PART 2: EXPLICIT ROLE SCOPING
-- ============================================================================

-- SALES TABLE: Add explicit TO clauses
DROP POLICY IF EXISTS "sales_public_read" ON lootaura_v2.sales;
CREATE POLICY "sales_public_read" ON lootaura_v2.sales
    FOR SELECT
    TO anon, authenticated
    USING (status = 'published');

DROP POLICY IF EXISTS "sales_owner_read" ON lootaura_v2.sales;
CREATE POLICY "sales_owner_read" ON lootaura_v2.sales
    FOR SELECT
    TO authenticated
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "sales_owner_insert" ON lootaura_v2.sales;
CREATE POLICY "sales_owner_insert" ON lootaura_v2.sales
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "sales_owner_update" ON lootaura_v2.sales;
CREATE POLICY "sales_owner_update" ON lootaura_v2.sales
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "sales_owner_delete" ON lootaura_v2.sales;
CREATE POLICY "sales_owner_delete" ON lootaura_v2.sales
    FOR DELETE
    TO authenticated
    USING (auth.uid() = owner_id);

-- PROFILES TABLE: Add explicit TO clauses
DROP POLICY IF EXISTS "profiles_public_read" ON lootaura_v2.profiles;
CREATE POLICY "profiles_public_read" ON lootaura_v2.profiles
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "profiles_owner_insert" ON lootaura_v2.profiles;
CREATE POLICY "profiles_owner_insert" ON lootaura_v2.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_owner_update" ON lootaura_v2.profiles;
CREATE POLICY "profiles_owner_update" ON lootaura_v2.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- FAVORITES TABLE: Add explicit TO clauses
DROP POLICY IF EXISTS "favorites_owner_read" ON lootaura_v2.favorites;
CREATE POLICY "favorites_owner_read" ON lootaura_v2.favorites
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorites_owner_insert" ON lootaura_v2.favorites;
CREATE POLICY "favorites_owner_insert" ON lootaura_v2.favorites
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorites_owner_delete" ON lootaura_v2.favorites;
CREATE POLICY "favorites_owner_delete" ON lootaura_v2.favorites
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================================================
-- PART 3: BASE TABLE GRANT AUDIT
-- ============================================================================

-- Grant SELECT on lootaura_v2.profiles to anon and authenticated
-- The application queries this base table directly via fromBase() in:
-- - lib/auth/accountLock.ts
-- - app/api/profile/update/route.ts
-- - app/api/profile/notifications/route.ts
-- - app/api/admin/* routes
-- - lib/jobs/processor.ts
GRANT SELECT ON lootaura_v2.profiles TO anon, authenticated;

-- Note: lootaura_v2.reviews is NOT queried directly by the application
-- (only views are used), so no GRANT needed for reviews base table.

-- ============================================================================
-- VERIFICATION COMMENTS
-- ============================================================================

COMMENT ON FUNCTION lootaura_v2.is_sale_owned_by_user(uuid) IS 
    'Security hardening: SECURITY DEFINER function for owner checks. Eliminates nested RLS issues in items owner policies.';

COMMENT ON POLICY "sales_public_read" ON lootaura_v2.sales IS 
    'Security hardening: Explicit TO anon, authenticated clause added for clarity.';
COMMENT ON POLICY "sales_owner_read" ON lootaura_v2.sales IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';
COMMENT ON POLICY "sales_owner_insert" ON lootaura_v2.sales IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';
COMMENT ON POLICY "sales_owner_update" ON lootaura_v2.sales IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';
COMMENT ON POLICY "sales_owner_delete" ON lootaura_v2.sales IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';

COMMENT ON POLICY "profiles_public_read" ON lootaura_v2.profiles IS 
    'Security hardening: Explicit TO anon, authenticated clause added for clarity.';
COMMENT ON POLICY "profiles_owner_insert" ON lootaura_v2.profiles IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';
COMMENT ON POLICY "profiles_owner_update" ON lootaura_v2.profiles IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';

COMMENT ON POLICY "favorites_owner_read" ON lootaura_v2.favorites IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';
COMMENT ON POLICY "favorites_owner_insert" ON lootaura_v2.favorites IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';
COMMENT ON POLICY "favorites_owner_delete" ON lootaura_v2.favorites IS 
    'Security hardening: Explicit TO authenticated clause added for clarity.';

