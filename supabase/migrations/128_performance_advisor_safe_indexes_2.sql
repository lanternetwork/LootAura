-- Performance Advisor: Missing Indexes Migration (Part 2 of 5)
-- Index: idx_sales_status_archived
-- Resolves: status + archived_at filter pattern
--
-- Query pattern: WHERE status IN ('published', 'active') AND archived_at IS NULL
-- Used by: /api/sales/route.ts, lib/data/sales.ts
-- Impact: High - Common public sales query pattern

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_status_archived 
ON lootaura_v2.sales(status, archived_at)
WHERE status IN ('published', 'active') AND archived_at IS NULL;
