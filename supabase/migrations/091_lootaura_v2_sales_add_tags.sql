-- 091_lootaura_v2_sales_add_tags.sql
-- Add tags column to lootaura_v2.sales to support category chips on sale detail.
-- This aligns the database schema with the application code, which now
-- writes a string[] of tags when creating/publishing sales.
--
-- Constraints:
-- - Idempotent: safe to run multiple times.
-- - Forward-only: no destructive changes.
-- - Does not change existing RLS policies or behavior for existing rows.

DO $$
BEGIN
  -- Add tags column if it does not already exist.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2'
      AND table_name = 'sales'
      AND column_name = 'tags'
  ) THEN
    ALTER TABLE lootaura_v2.sales
      ADD COLUMN tags TEXT[] DEFAULT '{}'::TEXT[];
  END IF;
END
$$;


