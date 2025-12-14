-- Add moderation status fields to sales table
-- Allows admins to hide sales and track moderation state

-- Check if columns already exist before adding
DO $$
BEGIN
  -- Add moderation_status field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'sales' 
    AND column_name = 'moderation_status'
  ) THEN
    ALTER TABLE lootaura_v2.sales 
      ADD COLUMN moderation_status text NOT NULL DEFAULT 'visible' 
      CHECK (moderation_status IN ('visible', 'hidden_by_admin', 'under_review'));
  END IF;

  -- Add moderation_notes field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'sales' 
    AND column_name = 'moderation_notes'
  ) THEN
    ALTER TABLE lootaura_v2.sales 
      ADD COLUMN moderation_notes text NULL;
  END IF;
END $$;

-- Index for efficient filtering of hidden sales
CREATE INDEX IF NOT EXISTS idx_sales_moderation_status 
  ON lootaura_v2.sales(moderation_status)
  WHERE moderation_status != 'visible';

-- Add comments
COMMENT ON COLUMN lootaura_v2.sales.moderation_status IS 
  'Moderation status: visible (default), hidden_by_admin, under_review. Hidden sales are excluded from public views.';

COMMENT ON COLUMN lootaura_v2.sales.moderation_notes IS 
  'Internal admin notes about moderation actions taken.';

-- Note: RLS policies remain unchanged - admins will use service role to update moderation fields
-- Public queries should filter out sales with moderation_status = 'hidden_by_admin'

