-- Test script to verify category filtering is working
-- Run this to confirm the category filter implementation

-- 1. Check that the items_v2 view has the category column
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'items_v2'
    AND column_name = 'category';

-- 2. Check current categories in the data
SELECT 
    category,
    COUNT(*) as count
FROM public.items_v2 
GROUP BY category
ORDER BY count DESC;

-- 3. Test category filtering (should return items with category = 'general')
SELECT 
    id,
    name,
    category,
    category
FROM public.items_v2 
WHERE category = 'general'
LIMIT 5;

-- 4. Test the API query pattern (what the endpoints will use)
SELECT 
    s.id,
    s.title,
    i.name as item_name,
    i.category
FROM public.sales_v2 s
JOIN public.items_v2 i ON s.id = i.sale_id
WHERE i.category = 'general'
LIMIT 3;

-- 5. Test multiple categories (OR logic)
SELECT 
    s.id,
    s.title,
    i.name as item_name,
    i.category
FROM public.sales_v2 s
JOIN public.items_v2 i ON s.id = i.sale_id
WHERE i.category = ANY(ARRAY['general', 'furniture'])
LIMIT 3;
