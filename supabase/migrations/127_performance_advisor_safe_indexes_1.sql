-- Performance Advisor: Missing Indexes Migration (Part 1 of 5)
-- Index: idx_sales_status_moderation
-- Resolves: status + moderation_status filter pattern
--
-- Query pattern: WHERE status IN ('published', 'active') AND moderation_status != 'hidden_by_admin'
-- Used by: /api/sales/route.ts, /api/sales/search/route.ts, lib/data/sales.ts
-- Impact: High - Most common public sales query pattern

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_status_moderation 
ON lootaura_v2.sales(status, moderation_status)
WHERE status IN ('published', 'active') AND moderation_status != 'hidden_by_admin';
