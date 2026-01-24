-- Performance Advisor: Missing Indexes Migration (Part 3 of 5)
-- Index: idx_sales_owner_status_archived
-- Resolves: owner_id + status + archived_at filter pattern
--
-- Query pattern: WHERE owner_id = X AND status = Y AND (archived_at >= Z OR date_end >= Z)
-- Used by: /api/profile/listings/route.ts, lib/data/salesAccess.ts
-- Impact: Medium - User dashboard and listing queries

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_owner_status_archived 
ON lootaura_v2.sales(owner_id, status, archived_at)
WHERE owner_id IS NOT NULL;
