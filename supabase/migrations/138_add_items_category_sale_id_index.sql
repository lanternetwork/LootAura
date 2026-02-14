-- Performance index for category filtering queries
-- This composite index optimizes the query pattern used by /api/sales and /api/sales/markers
-- when categories are provided as filters.
--
-- Query pattern:
--   SELECT sale_id FROM items_v2 WHERE category IN (...)
--
-- The composite index on (category, sale_id) allows the database to:
-- 1. Quickly filter by category using the index
-- 2. Return sale_id values directly from the index (covering index benefit)
--
-- Note: Standard CREATE INDEX (not CONCURRENT) is used here for compatibility with
-- Supabase migration system. This will acquire a lock on the items table during
-- index creation, but the operation should complete quickly for typical table sizes.
-- For very large tables, consider running CONCURRENT index creation manually if needed.

CREATE INDEX IF NOT EXISTS idx_items_category_sale_id 
ON lootaura_v2.items(category, sale_id)
WHERE category IS NOT NULL;

-- Add index comment for documentation
COMMENT ON INDEX lootaura_v2.idx_items_category_sale_id IS 
    'Composite index for category filtering queries. Used by /api/sales and /api/sales/markers when categories are provided. Optimizes SELECT sale_id FROM items_v2 WHERE category IN (...).';
