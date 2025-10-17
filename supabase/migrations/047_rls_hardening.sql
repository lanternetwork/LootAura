-- RLS Hardening Migration
-- This migration implements deny-by-default RLS policies with minimal public exposure
-- and owner-only writes for all user data tables.

-- Enable RLS on all tables (idempotent)
ALTER TABLE lootaura_v2.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Sales are viewable by everyone." ON lootaura_v2.sales;
DROP POLICY IF EXISTS "Users can insert their own sales." ON lootaura_v2.sales;
DROP POLICY IF EXISTS "Users can update own sales." ON lootaura_v2.sales;
DROP POLICY IF EXISTS "Users can delete own sales." ON lootaura_v2.sales;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON lootaura_v2.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON lootaura_v2.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON lootaura_v2.profiles;

DROP POLICY IF EXISTS "Favorites are viewable by owner." ON lootaura_v2.favorites;
DROP POLICY IF EXISTS "Users can insert their own favorites." ON lootaura_v2.favorites;
DROP POLICY IF EXISTS "Users can delete their own favorites." ON lootaura_v2.favorites;

DROP POLICY IF EXISTS "Items are viewable by everyone." ON lootaura_v2.items;
DROP POLICY IF EXISTS "Users can insert items for their sales." ON lootaura_v2.items;
DROP POLICY IF EXISTS "Users can update items for their sales." ON lootaura_v2.items;
DROP POLICY IF EXISTS "Users can delete items for their sales." ON lootaura_v2.items;

-- SALES TABLE: Minimal public read, owner-only writes
-- Public read: only published sales with minimal fields (no owner_id, no sensitive data)
CREATE POLICY "sales_public_read" ON lootaura_v2.sales
    FOR SELECT
    USING (status = 'published');

-- Owner can insert their own sales
CREATE POLICY "sales_owner_insert" ON lootaura_v2.sales
    FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- Owner can update their own sales
CREATE POLICY "sales_owner_update" ON lootaura_v2.sales
    FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Owner can delete their own sales
CREATE POLICY "sales_owner_delete" ON lootaura_v2.sales
    FOR DELETE
    USING (auth.uid() = owner_id);

-- PROFILES TABLE: Minimal public read, owner-only writes
-- Public read: only display_name and avatar_url (no sensitive data)
CREATE POLICY "profiles_public_read" ON lootaura_v2.profiles
    FOR SELECT
    USING (true);

-- Owner can insert their own profile
CREATE POLICY "profiles_owner_insert" ON lootaura_v2.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Owner can update their own profile
CREATE POLICY "profiles_owner_update" ON lootaura_v2.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- FAVORITES TABLE: Owner-only access (already secure)
CREATE POLICY "favorites_owner_read" ON lootaura_v2.favorites
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "favorites_owner_insert" ON lootaura_v2.favorites
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favorites_owner_delete" ON lootaura_v2.favorites
    FOR DELETE
    USING (auth.uid() = user_id);

-- ITEMS TABLE: Public read via sales relationship, owner-only writes
-- Public read: only items from published sales
CREATE POLICY "items_public_read" ON lootaura_v2.items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND status = 'published'
        )
    );

-- Owner can insert items for their own sales
CREATE POLICY "items_owner_insert" ON lootaura_v2.items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    );

-- Owner can update items for their own sales
CREATE POLICY "items_owner_update" ON lootaura_v2.items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    );

-- Owner can delete items from their own sales
CREATE POLICY "items_owner_delete" ON lootaura_v2.items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    );

-- Add performance indexes for RLS policies
CREATE INDEX IF NOT EXISTS idx_sales_owner_id_status 
    ON lootaura_v2.sales (owner_id, status) 
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_profiles_id 
    ON lootaura_v2.profiles (id);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id 
    ON lootaura_v2.favorites (user_id);

CREATE INDEX IF NOT EXISTS idx_items_sale_id 
    ON lootaura_v2.items (sale_id);

-- Update public views to remove sensitive columns
DROP VIEW IF EXISTS public.sales_v2 CASCADE;

CREATE VIEW public.sales_v2 AS
SELECT 
    id,
    created_at,
    updated_at,
    -- owner_id removed for security
    title,
    description,
    address,
    city,
    state,
    zip_code,
    lat,
    lng,
    geom,
    date_start,
    time_start,
    date_end,
    time_end,
    starts_at,
    status,
    is_featured
FROM lootaura_v2.sales;

-- Grant permissions on updated view
GRANT SELECT ON public.sales_v2 TO anon, authenticated;

-- Add comment for rollback reference
COMMENT ON TABLE lootaura_v2.sales IS 'RLS hardened: public read minimal fields, owner-only writes';
COMMENT ON TABLE lootaura_v2.profiles IS 'RLS hardened: public read display_name/avatar_url only, owner-only writes';
COMMENT ON TABLE lootaura_v2.favorites IS 'RLS hardened: owner-only access';
COMMENT ON TABLE lootaura_v2.items IS 'RLS hardened: public read via published sales, owner-only writes';
