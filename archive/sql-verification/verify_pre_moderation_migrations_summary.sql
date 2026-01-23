-- Summary query: Check if all pre-moderation migrations (103-106) are applied
-- Returns a single row with overall status

WITH checks AS (
  SELECT 
    -- Migration 103 checks
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_schema = 'lootaura_v2' AND table_name = 'sales' AND column_name = 'archived_at') AS m103_column,
    (SELECT COUNT(*) FROM pg_indexes 
     WHERE schemaname = 'lootaura_v2' AND tablename = 'sales' AND indexname = 'idx_sales_archived_at') AS m103_index,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'sales_v2' AND column_name = 'archived_at') AS m103_view,
    
    -- Migration 104 check
    (SELECT COUNT(*) FROM information_schema.views 
     WHERE table_schema = 'public' AND table_name = 'profiles_v2') AS m104_view,
    
    -- Migration 105 checks
    (SELECT COUNT(*) FROM information_schema.tables 
     WHERE table_schema = 'lootaura_v2' AND table_name = 'email_unsubscribe_tokens') AS m105_table,
    (SELECT COUNT(*) FROM pg_indexes 
     WHERE schemaname = 'lootaura_v2' AND tablename = 'email_unsubscribe_tokens' 
     AND indexname = 'idx_email_unsubscribe_tokens_token') AS m105_index,
    
    -- Migration 106 checks
    (SELECT COUNT(*) FROM information_schema.tables 
     WHERE table_schema = 'lootaura_v2' AND table_name = 'email_log') AS m106_table,
    (SELECT COUNT(*) FROM pg_indexes 
     WHERE schemaname = 'lootaura_v2' AND tablename = 'email_log' 
     AND indexname = 'idx_email_log_dedupe_key_unique') AS m106_index
)
SELECT 
  CASE 
    WHEN m103_column = 1 AND m103_index = 1 AND m103_view = 1 
         AND m104_view = 1 
         AND m105_table = 1 AND m105_index = 1 
         AND m106_table = 1 AND m106_index = 1 
    THEN '✓ ALL PRE-MODERATION MIGRATIONS APPLIED (103-106)'
    ELSE '✗ SOME MIGRATIONS MISSING - See detailed query for specifics'
  END AS overall_status,
  m103_column + m103_index + m103_view + m104_view + m105_table + m105_index + m106_table + m106_index AS checks_passed,
  8 AS total_checks
FROM checks;




