-- Add index on owner_id for efficient owner queries
-- This improves performance for dashboard queries filtering by owner_id
-- Note: Some indexes may already exist from previous migrations, so we use IF NOT EXISTS

-- Drop existing indexes with different names if they exist (for consistency)
DROP INDEX IF EXISTS lootaura_v2.idx_sales_owner_id;
DROP INDEX IF EXISTS lootaura_v2.sales_owner_id_idx;
DROP INDEX IF EXISTS lootaura_v2.idx_sales_owner;

-- Create index on owner_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_sales_owner_id 
    ON lootaura_v2.sales (owner_id);

-- Add composite index for common query pattern: owner_id + updated_at (for dashboard sorting)
-- Drop existing composite index if it exists
DROP INDEX IF EXISTS lootaura_v2.idx_sales_owner_updated;

CREATE INDEX IF NOT EXISTS idx_sales_owner_updated 
    ON lootaura_v2.sales (owner_id, updated_at DESC);

-- Add comments (only if indexes were created)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_owner_id' AND schemaname = 'lootaura_v2') THEN
        COMMENT ON INDEX lootaura_v2.idx_sales_owner_id IS 
            'Index for efficient owner queries (dashboard, user sales list)';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_owner_updated' AND schemaname = 'lootaura_v2') THEN
        COMMENT ON INDEX lootaura_v2.idx_sales_owner_updated IS 
            'Composite index for dashboard queries sorted by updated_at';
    END IF;
END $$;

