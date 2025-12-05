-- STEP 1: Enumerate all item-related tables and views
-- Run this with service-role/admin privileges in Supabase SQL editor
-- This will reveal where the REAL item data is stored

-- ============================================================
-- PART 1: Check table/view existence first
-- ============================================================

SELECT 
    'Table/View Existence Check' as section,
    table_schema,
    table_name,
    table_type,
    CASE 
        WHEN table_type = 'BASE TABLE' THEN 'base_table'
        WHEN table_type = 'VIEW' THEN 'view'
        ELSE table_type
    END as type_category
FROM information_schema.tables
WHERE (table_name LIKE '%item%' OR table_name LIKE '%sale_item%')
  AND table_schema IN ('public', 'lootaura_v2')
ORDER BY table_schema, table_name;

-- ============================================================
-- PART 2: Check all candidate base tables (conditional)
-- ============================================================

-- 2.1 Check public.sale_items (legacy v1 table) - only if exists
DO $$
DECLARE
    table_exists BOOLEAN;
    row_count INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'sale_items'
    ) INTO table_exists;
    
    IF table_exists THEN
        EXECUTE 'SELECT COUNT(*) FROM public.sale_items' INTO row_count;
        RAISE NOTICE 'public.sale_items: EXISTS, row_count = %', row_count;
    ELSE
        RAISE NOTICE 'public.sale_items: DOES NOT EXIST (may have been renamed to sale_items_legacy)';
    END IF;
END $$;

-- Query public.sale_items if it exists (using dynamic SQL)
DO $$
DECLARE
    table_exists BOOLEAN;
    row_count INTEGER;
    rec RECORD;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'sale_items'
    ) INTO table_exists;
    
    IF table_exists THEN
        EXECUTE 'SELECT COUNT(*) FROM public.sale_items' INTO row_count;
        RAISE NOTICE '=== public.sale_items RESULTS ===';
        RAISE NOTICE 'Row count: %', row_count;
        
        -- Show sample data
        RAISE NOTICE 'Sample rows (first 10):';
        FOR rec IN EXECUTE '
            SELECT 
                id::text as id,
                sale_id::text as sale_id,
                name,
                price::text as price,
                photo,
                created_at::text as created_at,
                category,
                "condition" as item_condition,
                purchased::text as purchased
            FROM public.sale_items
            ORDER BY created_at DESC
            LIMIT 10
        ' LOOP
            RAISE NOTICE '  ID: %, Sale ID: %, Name: %, Price: %, Photo: %, Created: %, Category: %, Condition: %, Purchased: %',
                rec.id, rec.sale_id, rec.name, rec.price, rec.photo, rec.created_at, rec.category, rec.item_condition, rec.purchased;
        END LOOP;
    END IF;
END $$;

-- 2.2 Check public.sale_items_legacy (if renamed by migration 090)
DO $$
DECLARE
    table_exists BOOLEAN;
    row_count INTEGER;
    rec RECORD;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'sale_items_legacy'
    ) INTO table_exists;
    
    IF table_exists THEN
        EXECUTE 'SELECT COUNT(*) FROM public.sale_items_legacy' INTO row_count;
        RAISE NOTICE '=== public.sale_items_legacy RESULTS ===';
        RAISE NOTICE 'Row count: %', row_count;
        
        -- Show sample data
        RAISE NOTICE 'Sample rows (first 10):';
        FOR rec IN EXECUTE '
            SELECT 
                id::text as id,
                sale_id::text as sale_id,
                name,
                price::text as price,
                photo,
                created_at::text as created_at,
                category,
                "condition" as item_condition,
                purchased::text as purchased
            FROM public.sale_items_legacy
            ORDER BY created_at DESC
            LIMIT 10
        ' LOOP
            RAISE NOTICE '  ID: %, Sale ID: %, Name: %, Price: %, Photo: %, Created: %, Category: %, Condition: %, Purchased: %',
                rec.id, rec.sale_id, rec.name, rec.price, rec.photo, rec.created_at, rec.category, rec.item_condition, rec.purchased;
        END LOOP;
    ELSE
        RAISE NOTICE 'public.sale_items_legacy: DOES NOT EXIST';
    END IF;
END $$;

-- 2.3 Check lootaura_v2.items (canonical v2 table) - should always exist
SELECT 
    'lootaura_v2.items' as source,
    COUNT(*) as row_count,
    'base_table' as type
FROM lootaura_v2.items;

SELECT 
    'lootaura_v2.items' as source,
    id,
    sale_id,
    name,
    price,
    image_url,
    images,
    created_at,
    category,
    condition as item_condition,
    is_sold as purchased
FROM lootaura_v2.items
ORDER BY created_at DESC
LIMIT 10;

-- 2.4 Check if public.items exists (shouldn't, but check anyway)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'items' AND table_type = 'BASE TABLE') THEN
        RAISE NOTICE 'WARNING: public.items table exists (unexpected)';
    ELSE
        RAISE NOTICE 'public.items table does not exist (expected)';
    END IF;
END $$;

-- ============================================================
-- PART 3: Check all views
-- ============================================================

-- 3.1 Check public.items_v2 view
SELECT 
    'public.items_v2' as source,
    COUNT(*) as row_count,
    'view' as type
FROM public.items_v2;

SELECT 
    'public.items_v2' as source,
    id,
    sale_id,
    name,
    price,
    image_url,
    images,
    created_at,
    category,
    condition as item_condition
FROM public.items_v2
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================
-- PART 4: Check column structures for comparison
-- ============================================================

-- 4.1 public.sale_items columns (if exists)
SELECT 
    'public.sale_items' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sale_items'
ORDER BY ordinal_position;

-- 4.2 public.sale_items_legacy columns (if exists)
SELECT 
    'public.sale_items_legacy' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sale_items_legacy'
ORDER BY ordinal_position;

-- 4.3 lootaura_v2.items columns
SELECT 
    'lootaura_v2.items' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'lootaura_v2' AND table_name = 'items'
ORDER BY ordinal_position;

-- 4.4 public.items_v2 view columns
SELECT 
    'public.items_v2' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'items_v2'
ORDER BY ordinal_position;

-- ============================================================
-- PART 5: Sample data from legacy tables (if they exist)
-- ============================================================

-- Note: These queries will fail if the tables don't exist, but that's okay
-- The DO blocks above will tell you which tables exist

-- If public.sale_items exists, uncomment and run:
-- SELECT 
--     'public.sale_items' as source,
--     id,
--     sale_id,
--     name,
--     price,
--     photo as image_url_or_photo,
--     created_at,
--     category,
--     "condition" as item_condition,
--     purchased
-- FROM public.sale_items
-- ORDER BY created_at DESC
-- LIMIT 10;

-- If public.sale_items_legacy exists, uncomment and run:
-- SELECT 
--     'public.sale_items_legacy' as source,
--     id,
--     sale_id,
--     name,
--     price,
--     photo as image_url_or_photo,
--     created_at,
--     category,
--     "condition" as item_condition,
--     purchased
-- FROM public.sale_items_legacy
-- ORDER BY created_at DESC
-- LIMIT 10;
