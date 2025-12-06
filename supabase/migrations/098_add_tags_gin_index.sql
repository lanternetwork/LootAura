-- 098_add_tags_gin_index.sql
-- Add GIN index on tags column for efficient array filtering queries
-- This enables fast category/tag filtering in sales queries
--
-- Constraints:
-- - Idempotent: safe to run multiple times
-- - Forward-only: no destructive changes

-- Create GIN index on tags column for efficient array operations
CREATE INDEX IF NOT EXISTS idx_sales_tags_gin ON lootaura_v2.sales USING GIN (tags);

-- Add comment explaining the index purpose
COMMENT ON INDEX lootaura_v2.idx_sales_tags_gin IS 'GIN index on tags array column for efficient category/tag filtering in sales queries';

