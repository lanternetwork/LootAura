-- Detailed diagnostic query to identify exactly which pre-moderation migrations are missing
-- Run this to see what needs to be applied

SELECT 
  'Migration 103: archived_at column in sales table' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'archived_at'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 103'
  END AS status,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'archived_at'
    ) THEN NULL
    ELSE 'ALTER TABLE lootaura_v2.sales ADD COLUMN archived_at TIMESTAMPTZ NULL;'
  END AS fix_sql
UNION ALL
SELECT 
  'Migration 103: idx_sales_archived_at index' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'lootaura_v2' 
      AND tablename = 'sales' 
      AND indexname = 'idx_sales_archived_at'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 103'
  END AS status,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'lootaura_v2' 
      AND tablename = 'sales' 
      AND indexname = 'idx_sales_archived_at'
    ) THEN NULL
    ELSE 'CREATE INDEX idx_sales_archived_at ON lootaura_v2.sales(archived_at) WHERE archived_at IS NOT NULL;'
  END AS fix_sql
UNION ALL
SELECT 
  'Migration 103: archived_at in sales_v2 view' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sales_v2' 
      AND column_name = 'archived_at'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 103 (view needs to be recreated)'
  END AS status,
  NULL AS fix_sql
UNION ALL
SELECT 
  'Migration 104: profiles_v2 view exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'profiles_v2'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 104'
  END AS status,
  NULL AS fix_sql
UNION ALL
SELECT 
  'Migration 105: email_unsubscribe_tokens table' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'email_unsubscribe_tokens'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 105'
  END AS status,
  NULL AS fix_sql
UNION ALL
SELECT 
  'Migration 105: email_unsubscribe_tokens token index' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'lootaura_v2' 
      AND tablename = 'email_unsubscribe_tokens' 
      AND indexname = 'idx_email_unsubscribe_tokens_token'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 105'
  END AS status,
  NULL AS fix_sql
UNION ALL
SELECT 
  'Migration 106: email_log table' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'email_log'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 106'
  END AS status,
  NULL AS fix_sql
UNION ALL
SELECT 
  'Migration 106: email_log dedupe_key unique index' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE schemaname = 'lootaura_v2' 
      AND tablename = 'email_log' 
      AND indexname = 'idx_email_log_dedupe_key_unique'
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 106'
  END AS status,
  NULL AS fix_sql
ORDER BY check_name;




