-- Performance Advisor: Missing Indexes Migration (Part 5 of 5)
-- Index: idx_sales_status_moderation_archived
-- Resolves: Triple filter pattern (status + moderation_status + archived_at)
--
-- Query pattern: WHERE status IN ('published', 'active') AND moderation_status != 'hidden_by_admin' AND archived_at IS NULL
-- Used by: /api/sales/route.ts, lib/data/sales.ts (combined filters)
-- Impact: High - Common public sales query pattern with all three filters

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_status_moderation_archived 
ON lootaura_v2.sales(status, moderation_status, archived_at)
WHERE status IN ('published', 'active') 
  AND moderation_status != 'hidden_by_admin' 
  AND archived_at IS NULL;
