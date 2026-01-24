-- Performance Advisor: Missing Indexes Migration (Part 4 of 5)
-- Index: idx_sales_status_archived_date_end
-- Resolves: Archive retention queries with date_end
--
-- Query pattern: WHERE status = 'archived' AND (archived_at >= X OR date_end >= X)
-- Used by: /api/profile/listings/route.ts (archived status filter)
-- Impact: Low-Medium - Archive retention queries (less frequent but important)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_status_archived_date_end 
ON lootaura_v2.sales(status, archived_at, date_end)
WHERE status = 'archived';
