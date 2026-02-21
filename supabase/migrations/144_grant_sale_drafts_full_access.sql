-- Grant full access (SELECT, INSERT, UPDATE, DELETE) on lootaura_v2.sale_drafts to authenticated role
-- This makes base table privileges explicit and prevents future "permission denied" surprises
--
-- Migration 141 already granted INSERT and UPDATE, but SELECT and DELETE were not explicit.
-- This migration ensures all four privileges are explicitly granted on the base table.
-- View grants (in migration 071) are not touched - this only affects the base table.
--
-- RLS policies still enforce that users can only access their own drafts (user_id = auth.uid())

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lootaura_v2.sale_drafts TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE lootaura_v2.sale_drafts IS
  'Sale drafts table. Full access (SELECT, INSERT, UPDATE, DELETE) granted to authenticated role. RLS policies enforce user_id = auth.uid() for all operations.';
