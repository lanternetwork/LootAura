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
  EXECUTE format($sql$SELECT COUNT(*) FROM %I$sql$, legacy_table_name) INTO items_to_migrate_count;
  
  IF items_to_migrate_count = 0 THEN
    RAISE NOTICE 'Legacy table % has no items to migrate', legacy_table_name;
    RETURN;
  END IF;

  RAISE NOTICE 'Found % items in % to migrate', items_to_migrate_count, legacy_table_name;

  -- Migrate items, only inserting items where:
  -- 1. The sale_id exists in lootaura_v2.sales (items must reference valid sales)
  -- 2. The item doesn't already exist in lootaura_v2.items (avoid duplicates)
  EXECUTE format($sql$
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
      NULL as description,
      leg.price,
      leg.category,
      leg."condition" as condition,
      leg.photo as image_url,
      leg.purchased as is_sold,
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
  $sql$, legacy_table_name);

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % items from % to lootaura_v2.items', migrated_count, legacy_table_name;

  -- Log any items that couldn't be migrated (sale_id doesn't exist in lootaura_v2.sales)
  EXECUTE format($sql$SELECT COUNT(*) FROM %I leg WHERE NOT EXISTS (SELECT 1 FROM lootaura_v2.sales s WHERE s.id = leg.sale_id)$sql$, legacy_table_name) INTO items_to_migrate_count;
  
  IF items_to_migrate_count > 0 THEN
    RAISE WARNING $msg$% items in % could not be migrated because their sale_id does not exist in lootaura_v2.sales$msg$, items_to_migrate_count, legacy_table_name;
  END IF;

END $$;

-- Step 3: Ensure items_v2 view includes all necessary columns and selects from canonical table
-- Recreate the view with only columns that exist in the base table
DROP VIEW IF EXISTS public.items_v2 CASCADE;

-- Build view definition dynamically based on what columns exist
DO $$
DECLARE
    has_condition BOOLEAN;
    has_images BOOLEAN;
    has_is_sold BOOLEAN;
    has_updated_at BOOLEAN;
    view_sql TEXT;
BEGIN
    -- Check which optional columns exist in base table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' AND table_name = 'items' AND column_name = 'condition'
    ) INTO has_condition;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' AND table_name = 'items' AND column_name = 'images'
    ) INTO has_images;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' AND table_name = 'items' AND column_name = 'is_sold'
    ) INTO has_is_sold;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' AND table_name = 'items' AND column_name = 'updated_at'
    ) INTO has_updated_at;
    
    -- Build view SQL with only existing columns
    view_sql := 'CREATE VIEW public.items_v2 AS SELECT id, created_at, sale_id, name, description, price, image_url, category';
    
    IF has_condition THEN
        view_sql := view_sql || ', condition';
    END IF;
    
    IF has_images THEN
        view_sql := view_sql || ', images';
    END IF;
    
    IF has_is_sold THEN
        view_sql := view_sql || ', is_sold';
    END IF;
    
    IF has_updated_at THEN
        view_sql := view_sql || ', updated_at';
    END IF;
    
    view_sql := view_sql || ' FROM lootaura_v2.items';
    
    -- Create the view
    EXECUTE view_sql;
    
    RAISE NOTICE 'Created public.items_v2 view with columns: id, created_at, sale_id, name, description, price, image_url, category';
    IF has_condition THEN
        RAISE NOTICE '  + condition';
    END IF;
    IF has_images THEN
        RAISE NOTICE '  + images';
    END IF;
    IF has_is_sold THEN
        RAISE NOTICE '  + is_sold';
    END IF;
    IF has_updated_at THEN
        RAISE NOTICE '  + updated_at';
    END IF;
END $$;

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

