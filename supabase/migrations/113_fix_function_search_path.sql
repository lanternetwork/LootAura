-- Fix function search_path for cleanup_old_analytics_events
-- This addresses Supabase Security Advisor warning for function_search_path_mutable
--
-- The function accesses lootaura_v2.analytics_events, so it needs:
-- search_path = pg_catalog, public, lootaura_v2

ALTER FUNCTION lootaura_v2.cleanup_old_analytics_events()
SET search_path = pg_catalog, public, lootaura_v2;

COMMENT ON FUNCTION lootaura_v2.cleanup_old_analytics_events() IS 
  'Deletes analytics events older than 180 days (6 months). Retention window chosen to balance data preservation with database size management. Can be called from cron jobs or manually. Function has fixed search_path for security.';

