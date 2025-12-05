-- STEP 1: Enumerate all item-related tables and views
-- Run this with service-role/admin privileges in Supabase SQL editor
-- This will reveal where the REAL item data is stored

-- ============================================================
-- PART 1: Check all candidate base tables
-- ============================================================

-- 1.1 Check public.sale_items (legacy v1 table)
SELECT 
    'public.sale_items' as source,
    COUNT(*) as row_count,
    'base_table' as type
FROM public.sale_items;

SELECT 
    'public.sale_items' as source,
    id,
    sale_id,
    name,
    price,
    photo as image_url_or_photo,
    created_at,
    category,
    "condition" as item_condition,
    purchased
FROM public.sale_items
ORDER BY created_at DESC
LIMIT 10;

-- 1.2 Check public.sale_items_legacy (if renamed by migration 090)
SELECT 
    'public.sale_items_legacy' as source,
    COUNT(*) as row_count,
    'base_table' as type
FROM public.sale_items_legacy;

SELECT 
    'public.sale_items_legacy' as source,
    id,
    sale_id,
    name,
    price,
    photo as image_url_or_photo,
    created_at,
    category,
    "condition" as item_condition,
    purchased
FROM public.sale_items_legacy
ORDER BY created_at DESC
LIMIT 10;

-- 1.3 Check lootaura_v2.items (canonical v2 table)
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

-- 1.4 Check if public.items exists (shouldn't, but check anyway)
SELECT 
    'public.items' as source,
    COUNT(*) as row_count,
    'base_table' as type
FROM public.items
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'items');

-- ============================================================
-- PART 2: Check all views
-- ============================================================

-- 2.1 Check public.items_v2 view
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
-- PART 3: Check table/view existence and schemas
-- ============================================================

SELECT 
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
-- PART 5: Check for sales that have items in legacy but not in v2
-- ============================================================

-- 5.1 Sales with items in legacy table but not in v2
SELECT 
    'Sales with legacy items but no v2 items' as check_type,
    COUNT(DISTINCT leg.sale_id) as sale_count,
    COUNT(leg.id) as item_count
FROM public.sale_items leg
LEFT JOIN lootaura_v2.items v2 ON v2.sale_id = leg.sale_id
WHERE v2.id IS NULL
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items');

-- 5.2 Sample of such sales
SELECT 
    leg.sale_id,
    COUNT(leg.id) as legacy_item_count,
    COUNT(v2.id) as v2_item_count
FROM public.sale_items leg
LEFT JOIN lootaura_v2.items v2 ON v2.sale_id = leg.sale_id
WHERE v2.id IS NULL
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items')
GROUP BY leg.sale_id
ORDER BY legacy_item_count DESC
LIMIT 10;

