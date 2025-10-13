-- Database verification script for items_v2 view
-- This script verifies that the category column exists and is properly configured

-- 1. Check if items_v2 view exists and has category column
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'items_v2' 
ORDER BY ordinal_position;

-- 2. Check row count in items_v2
SELECT COUNT(*) as item_count FROM public.items_v2;

-- 3. Check if category column has data
SELECT 
    category,
    COUNT(*) as count
FROM public.items_v2 
WHERE category IS NOT NULL
GROUP BY category
ORDER BY count DESC
LIMIT 10;

-- 4. Check for any NULL categories
SELECT 
    COUNT(*) as total_items,
    COUNT(category) as items_with_category,
    COUNT(*) - COUNT(category) as items_without_category
FROM public.items_v2;

-- 5. Verify the underlying lootaura_v2.items table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items' 
    AND column_name = 'category'
ORDER BY ordinal_position;

-- 6. Check for indexes on category column (if any)
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'items_v2' 
    AND indexdef LIKE '%category%';

-- 7. Test a sample query with category filtering
SELECT 
    s.id,
    s.title,
    i.category,
    i.name as item_name
FROM public.sales_v2 s
JOIN public.items_v2 i ON s.id = i.sale_id
WHERE i.category = 'tools'
LIMIT 5;
