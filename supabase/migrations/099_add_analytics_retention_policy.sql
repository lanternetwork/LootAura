-- 099_add_analytics_retention_policy.sql
-- Add analytics retention policy to automatically clean up old analytics events
-- Retention window: 180 days (6 months)
-- This helps manage database size while preserving recent analytics data
--
-- Constraints:
-- - Idempotent: safe to run multiple times
-- - Forward-only: no destructive changes
-- - No RLS changes

-- Create function to delete old analytics events
-- Retention window: 180 days (6 months)
CREATE OR REPLACE FUNCTION lootaura_v2.cleanup_old_analytics_events()
RETURNS TABLE(deleted_count bigint) AS $$
DECLARE
  cutoff_date timestamptz;
  deleted bigint;
BEGIN
  -- Calculate cutoff date: 180 days ago
  cutoff_date := NOW() - INTERVAL '180 days';
  
  -- Delete events older than cutoff date (excluding test events for now)
  -- Test events are kept separately for development/testing purposes
  DELETE FROM lootaura_v2.analytics_events
  WHERE ts < cutoff_date
    AND is_test = false;
  
  GET DIAGNOSTICS deleted = ROW_COUNT;
  
  RETURN QUERY SELECT deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service_role (for cron jobs)
GRANT EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() TO service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION lootaura_v2.cleanup_old_analytics_events() IS 
  'Deletes analytics events older than 180 days (6 months). Retention window chosen to balance data preservation with database size management. Can be called from cron jobs or manually.';

-- Note: This function should be called periodically (e.g., weekly) via cron
-- Example: SELECT * FROM lootaura_v2.cleanup_old_analytics_events();

