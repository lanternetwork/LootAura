-- Verification query for Performance Advisor indexes
-- This migration verifies that all 5 indexes were created successfully
-- Run this after migrations 127-131 to confirm index creation

-- Check if all expected indexes exist with their sizes
SELECT 
    i.indexname,
    i.indexdef,
    pg_size_pretty(pg_relation_size(c.oid)) as index_size
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
WHERE i.schemaname = 'lootaura_v2' 
  AND i.tablename = 'sales' 
  AND i.indexname IN (
    'idx_sales_status_moderation',
    'idx_sales_status_archived',
    'idx_sales_owner_status_archived',
    'idx_sales_status_archived_date_end',
    'idx_sales_status_moderation_archived'
  )
ORDER BY i.indexname;

-- Expected result: 5 rows (one for each index)
-- If fewer than 5 rows are returned, some indexes failed to create
