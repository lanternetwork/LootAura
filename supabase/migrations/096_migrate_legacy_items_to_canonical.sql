-- Migration 096: Migrate legacy items to canonical lootaura_v2.items table
-- This migration moves all legacy item data from public.sale_items (or public.sale_items_legacy)
-- into the canonical lootaura_v2.items table.
--
-- Canonical base table decision: lootaura_v2.items is the canonical table.
-- All reads and writes should use this table (directly or via public.items_v2 view).

-- Step 1: Ensure lootaura_v2.items has all necessary columns
-- Add columns that might be missing (idempotent)
ALTER TABLE lootaura_v2.items
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS images TEXT[],
  ADD COLUMN IF NOT EXISTS is_sold BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Step 2: Migrate items from public.sale_items (if it exists and has data)
DO $$
DECLARE
  legacy_table_name TEXT;
  items_to_migrate_count INTEGER;
  migrated_count INTEGER := 0;
BEGIN
  -- Determine which legacy table exists
  IF to_regclass('public.sale_items') IS NOT NULL THEN
    legacy_table_name := 'public.sale_items';
  ELSIF to_regclass('public.sale_items_legacy') IS NOT NULL THEN
    legacy_table_name := 'public.sale_items_legacy';
  ELSE
    RAISE NOTICE 'No legacy items table found (checked public.sale_items and public.sale_items_legacy)';
    RETURN;
  END IF;

  -- Count items to migrate
  EXECUTE format('SELECT COUNT(*) FROM %I', legacy_table_name) INTO items_to_migrate_count;
  
  IF items_to_migrate_count = 0 THEN
    RAISE NOTICE 'Legacy table % has no items to migrate', legacy_table_name;
    RETURN;
  END IF;

  RAISE NOTICE 'Found % items in % to migrate', items_to_migrate_count, legacy_table_name;

  -- Migrate items, only inserting items where:
  -- 1. The sale_id exists in lootaura_v2.sales (items must reference valid sales)
  -- 2. The item doesn't already exist in lootaura_v2.items (avoid duplicates)
  EXECUTE format('
    INSERT INTO lootaura_v2.items (
      id,
      sale_id,
      name,
      description,
      price,
      category,
      condition,
      image_url,
      is_sold,
      created_at,
      updated_at
    )
    SELECT 
      leg.id,
      leg.sale_id,
      leg.name,
      NULL as description,  -- legacy table doesn't have description
      leg.price,
      leg.category,
      leg."condition" as condition,
      leg.photo as image_url,  -- map photo -> image_url
      leg.purchased as is_sold,  -- map purchased -> is_sold
      leg.created_at,
      COALESCE(leg.created_at, NOW()) as updated_at
    FROM %I leg
    WHERE EXISTS (
      SELECT 1 FROM lootaura_v2.sales s WHERE s.id = leg.sale_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM lootaura_v2.items i WHERE i.id = leg.id
    )
    ON CONFLICT (id) DO NOTHING
  ', legacy_table_name);

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % items from % to lootaura_v2.items', migrated_count, legacy_table_name;

  -- Log any items that couldn't be migrated (sale_id doesn't exist in lootaura_v2.sales)
  EXECUTE format('
    SELECT COUNT(*) FROM %I leg
    WHERE NOT EXISTS (
      SELECT 1 FROM lootaura_v2.sales s WHERE s.id = leg.sale_id
    )
  ', legacy_table_name) INTO items_to_migrate_count;
  
  IF items_to_migrate_count > 0 THEN
    RAISE WARNING '% items in % could not be migrated because their sale_id does not exist in lootaura_v2.sales', 
      items_to_migrate_count, legacy_table_name;
  END IF;

END $$;

-- Step 3: Ensure items_v2 view includes all necessary columns and selects from canonical table
-- Recreate the view to ensure it has image_url and all other columns
DROP VIEW IF EXISTS public.items_v2 CASCADE;

CREATE VIEW public.items_v2 AS
SELECT 
    id,
    created_at,
    sale_id,
    name,
    description,
    price,
    image_url,  -- Ensure image_url is included
    category,
    condition,
    images,  -- Also include images array for compatibility
    is_sold,
    updated_at
FROM lootaura_v2.items;

-- Grant permissions on the view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

-- Step 4: Verify migration results
DO $$
DECLARE
  total_items INTEGER;
  legacy_count INTEGER;
  view_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_items FROM lootaura_v2.items;
  SELECT COUNT(*) INTO view_count FROM public.items_v2;
  
  -- Check legacy table count (if exists)
  IF to_regclass('public.sale_items') IS NOT NULL THEN
    SELECT COUNT(*) INTO legacy_count FROM public.sale_items;
  ELSIF to_regclass('public.sale_items_legacy') IS NOT NULL THEN
    SELECT COUNT(*) INTO legacy_count FROM public.sale_items_legacy;
  ELSE
    legacy_count := 0;
  END IF;
  
  RAISE NOTICE 'Migration complete. Total items in lootaura_v2.items: %, Items in items_v2 view: %, Legacy items: %', 
    total_items, view_count, legacy_count;
END $$;

