-- Performance optimization indexes for sales search
-- This migration adds indexes to improve query performance for common search patterns

-- Index for date range filtering (most common filter)
CREATE INDEX IF NOT EXISTS idx_sales_v2_date_status 
ON lootaura_v2.sales_v2 (date_start, date_end, status) 
WHERE status = 'published';

-- Index for category filtering via items table
CREATE INDEX IF NOT EXISTS idx_items_category_sale_id 
ON lootaura_v2.items (category, sale_id) 
WHERE category IS NOT NULL;

-- Composite index for spatial + date filtering
CREATE INDEX IF NOT EXISTS idx_sales_v2_spatial_date 
ON lootaura_v2.sales_v2 (lat, lng, date_start, status) 
WHERE lat IS NOT NULL AND lng IS NOT NULL AND status = 'published';

-- Index for text search optimization
CREATE INDEX IF NOT EXISTS idx_sales_v2_text_search 
ON lootaura_v2.sales_v2 USING GIN (to_tsvector('english', title || ' ' || description || ' ' || address));

-- Index for city/state filtering
CREATE INDEX IF NOT EXISTS idx_sales_v2_location 
ON lootaura_v2.sales_v2 (city, state, status) 
WHERE city IS NOT NULL AND state IS NOT NULL;

-- Index for owner-based queries
CREATE INDEX IF NOT EXISTS idx_sales_v2_owner_created 
ON lootaura_v2.sales_v2 (owner_id, created_at DESC) 
WHERE owner_id IS NOT NULL;

-- Partial index for active sales only (most common query)
CREATE INDEX IF NOT EXISTS idx_sales_v2_active_spatial 
ON lootaura_v2.sales_v2 (lat, lng, created_at DESC) 
WHERE status = 'published' AND lat IS NOT NULL AND lng IS NOT NULL;

-- Index for date range queries with status
CREATE INDEX IF NOT EXISTS idx_sales_v2_date_status_created 
ON lootaura_v2.sales_v2 (date_start, date_end, status, created_at DESC) 
WHERE status = 'published';

-- Analyze tables to update statistics
ANALYZE lootaura_v2.sales_v2;
ANALYZE lootaura_v2.items;

-- Create a function to get query performance stats
CREATE OR REPLACE FUNCTION get_query_performance_stats()
RETURNS TABLE (
  query_pattern TEXT,
  avg_execution_time_ms NUMERIC,
  total_calls BIGINT,
  last_executed TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'spatial_search'::TEXT as query_pattern,
    ROUND(AVG(mean_time), 2) as avg_execution_time_ms,
    SUM(calls) as total_calls,
    MAX(last_exec) as last_executed
  FROM pg_stat_statements 
  WHERE query LIKE '%search_sales_within_distance%'
  
  UNION ALL
  
  SELECT 
    'category_filter'::TEXT as query_pattern,
    ROUND(AVG(mean_time), 2) as avg_execution_time_ms,
    SUM(calls) as total_calls,
    MAX(last_exec) as last_executed
  FROM pg_stat_statements 
  WHERE query LIKE '%items%category%'
  
  UNION ALL
  
  SELECT 
    'date_filter'::TEXT as query_pattern,
    ROUND(AVG(mean_time), 2) as avg_execution_time_ms,
    SUM(calls) as total_calls,
    MAX(last_exec) as last_executed
  FROM pg_stat_statements 
  WHERE query LIKE '%date_start%' OR query LIKE '%date_end%';
END;
$$ LANGUAGE plpgsql;

-- Create a function to monitor index usage
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE (
  table_name TEXT,
  index_name TEXT,
  index_scans BIGINT,
  tuples_read BIGINT,
  tuples_fetched BIGINT,
  index_size TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname||'.'||tablename as table_name,
    indexname as index_name,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
  FROM pg_stat_user_indexes 
  WHERE schemaname = 'lootaura_v2'
  ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;
