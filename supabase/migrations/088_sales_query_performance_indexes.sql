-- Performance indexes for sales queries
-- These indexes support the most common query patterns:
-- 1. Filtering by status + date_start (for date range queries)
-- 2. Spatial queries on lat/lng (bounding box queries)
-- 3. Status filtering (for published sales)

-- Composite index for status + date_start
-- Used by: /api/sales queries with date filters
-- Pattern: WHERE status = 'published' AND date_start >= X AND date_start <= Y
CREATE INDEX IF NOT EXISTS idx_sales_status_date_start 
ON lootaura_v2.sales(status, date_start)
WHERE status = 'published';

-- Index on status alone (for simple status filters)
-- Used by: queries that filter by status without date
-- Pattern: WHERE status = 'published'
CREATE INDEX IF NOT EXISTS idx_sales_status 
ON lootaura_v2.sales(status)
WHERE status = 'published';

-- Spatial index on lat/lng (if not already exists)
-- Used by: bounding box queries for map views
-- Pattern: WHERE lat >= X AND lat <= Y AND lng >= A AND lng <= B
-- Note: PostGIS spatial index (GIST) on geom column should already exist
-- This B-tree index on lat/lng helps with simple bounding box queries
CREATE INDEX IF NOT EXISTS idx_sales_lat_lng 
ON lootaura_v2.sales(lat, lng)
WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Composite index for owner_id + status + updated_at
-- Used by: user dashboard queries (getUserSales)
-- Pattern: WHERE owner_id = X AND status = Y ORDER BY updated_at DESC
-- Note: owner_id index already exists (migration 070), but composite helps with sorting
CREATE INDEX IF NOT EXISTS idx_sales_owner_status_updated 
ON lootaura_v2.sales(owner_id, status, updated_at DESC)
WHERE owner_id IS NOT NULL;

-- Comments for documentation (only if indexes exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_status_date_start' AND schemaname = 'lootaura_v2') THEN
        COMMENT ON INDEX lootaura_v2.idx_sales_status_date_start IS 
            'Composite index for filtering published sales by date range. Used by /api/sales queries.';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_status' AND schemaname = 'lootaura_v2') THEN
        COMMENT ON INDEX lootaura_v2.idx_sales_status IS 
            'Index for filtering sales by status. Used by public sales listings.';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_lat_lng' AND schemaname = 'lootaura_v2') THEN
        COMMENT ON INDEX lootaura_v2.idx_sales_lat_lng IS 
            'Spatial index for bounding box queries on lat/lng. Used by map-based sales queries.';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_owner_status_updated' AND schemaname = 'lootaura_v2') THEN
        COMMENT ON INDEX lootaura_v2.idx_sales_owner_status_updated IS 
            'Composite index for user dashboard queries. Supports filtering by owner and status with sorting by updated_at.';
    END IF;
END $$;

