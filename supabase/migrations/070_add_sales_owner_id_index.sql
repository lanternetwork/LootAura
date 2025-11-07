-- Add index on owner_id for efficient owner queries
-- This improves performance for dashboard queries filtering by owner_id

CREATE INDEX IF NOT EXISTS idx_sales_owner_id 
    ON lootaura_v2.sales (owner_id);

-- Add composite index for common query pattern: owner_id + updated_at (for dashboard sorting)
CREATE INDEX IF NOT EXISTS idx_sales_owner_updated 
    ON lootaura_v2.sales (owner_id, updated_at DESC);

-- Add comment
COMMENT ON INDEX idx_sales_owner_id IS 
    'Index for efficient owner queries (dashboard, user sales list)';

COMMENT ON INDEX idx_sales_owner_updated IS 
    'Composite index for dashboard queries sorted by updated_at';

