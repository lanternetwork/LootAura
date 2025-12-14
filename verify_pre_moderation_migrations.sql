-- Verify pre-moderation system migrations (103-106) have been applied
-- This query checks for the existence of key schema elements added by each migration

SELECT 
  'Migration 103: archived_at column' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'archived_at'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'Migration 103: archived_at index' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'lootaura_v2' 
      AND tablename = 'sales' 
      AND indexname = 'idx_sales_archived_at'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'Migration 103: sales_v2 view includes archived_at' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sales_v2' 
      AND column_name = 'archived_at'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'Migration 104: profiles_v2 view exists' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'profiles_v2'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'Migration 105: email_unsubscribe_tokens table' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'email_unsubscribe_tokens'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'Migration 105: email_unsubscribe_tokens token index' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'lootaura_v2' 
      AND tablename = 'email_unsubscribe_tokens' 
      AND indexname = 'idx_email_unsubscribe_tokens_token'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'Migration 106: email_log table' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'email_log'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
UNION ALL
SELECT 
  'Migration 106: email_log dedupe_key unique index' AS migration_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'lootaura_v2' 
      AND tablename = 'email_log' 
      AND indexname = 'idx_email_log_dedupe_key_unique'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING'
  END AS status
ORDER BY migration_check;




