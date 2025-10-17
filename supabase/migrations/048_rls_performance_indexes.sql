-- RLS Performance Indexes
-- This migration adds indexes to optimize RLS policy performance
-- and ensure queries remain fast with the new security policies.

-- Sales table indexes for RLS policies
-- Check if table exists before creating indexes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'sales') THEN
        CREATE INDEX IF NOT EXISTS idx_sales_rls_owner_status 
            ON lootaura_v2.sales (owner_id, status) 
            WHERE status = 'published';

        CREATE INDEX IF NOT EXISTS idx_sales_rls_status_created 
            ON lootaura_v2.sales (status, created_at DESC) 
            WHERE status = 'published';
    END IF;
END $$;

-- Profiles table indexes for RLS policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles') THEN
        CREATE INDEX IF NOT EXISTS idx_profiles_rls_id 
            ON lootaura_v2.profiles (id);
    END IF;
END $$;

-- Favorites table indexes for RLS policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'favorites') THEN
        CREATE INDEX IF NOT EXISTS idx_favorites_rls_user_id 
            ON lootaura_v2.favorites (user_id);

        CREATE INDEX IF NOT EXISTS idx_favorites_rls_sale_id 
            ON lootaura_v2.favorites (sale_id);
    END IF;
END $$;

-- Items table indexes for RLS policies (via sales relationship)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'items') THEN
        CREATE INDEX IF NOT EXISTS idx_items_rls_sale_id 
            ON lootaura_v2.items (sale_id);
    END IF;
END $$;

-- Composite index for items + sales join performance
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'items') THEN
        CREATE INDEX IF NOT EXISTS idx_items_sales_join 
            ON lootaura_v2.items (sale_id, id);
    END IF;
END $$;

-- Spatial indexes for public sales queries (already exist but ensure they're optimized)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'sales') THEN
        CREATE INDEX IF NOT EXISTS idx_sales_spatial_public 
            ON lootaura_v2.sales USING GIST (geom) 
            WHERE status = 'published' AND geom IS NOT NULL;

        -- Date range indexes for public sales queries
        CREATE INDEX IF NOT EXISTS idx_sales_date_public 
            ON lootaura_v2.sales (date_start, date_end, status) 
            WHERE status = 'published';

        -- Text search index for public sales (title, description, address)
        CREATE INDEX IF NOT EXISTS idx_sales_text_public 
            ON lootaura_v2.sales USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || address)) 
            WHERE status = 'published';
    END IF;
END $$;

-- Analyze tables to update statistics for query planner
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'sales') THEN
        ANALYZE lootaura_v2.sales;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles') THEN
        ANALYZE lootaura_v2.profiles;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'favorites') THEN
        ANALYZE lootaura_v2.favorites;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lootaura_v2' AND table_name = 'items') THEN
        ANALYZE lootaura_v2.items;
    END IF;
END $$;

-- Create a function to monitor RLS policy performance
CREATE OR REPLACE FUNCTION get_rls_performance_stats()
RETURNS TABLE (
    table_name TEXT,
    policy_name TEXT,
    avg_execution_time_ms NUMERIC,
    total_executions BIGINT
) AS $$
BEGIN
    -- This is a placeholder for future performance monitoring
    -- In production, you would query pg_stat_user_tables and pg_stat_user_indexes
    RETURN QUERY
    SELECT 
        'lootaura_v2.sales'::TEXT,
        'sales_public_read'::TEXT,
        0.0::NUMERIC,
        0::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for rollback reference
COMMENT ON INDEX idx_sales_rls_owner_status IS 'RLS performance: owner_id + status for policy evaluation';
COMMENT ON INDEX idx_profiles_rls_id IS 'RLS performance: profiles.id for owner policy';
COMMENT ON INDEX idx_favorites_rls_user_id IS 'RLS performance: favorites.user_id for owner policy';
COMMENT ON INDEX idx_items_rls_sale_id IS 'RLS performance: items.sale_id for sales relationship policy';
