-- Complete test of category filtering functionality
-- This verifies the entire pipeline is working

-- 1. Test the view has all expected columns
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'items_v2'
ORDER BY ordinal_position;

-- 2. Test category distribution
SELECT 
    category,
    COUNT(*) as count
FROM public.items_v2 
GROUP BY category
ORDER BY count DESC;

-- 3. Test filtering by furniture category
SELECT 
    s.id,
    s.title,
    i.name as item_name,
    i.category
FROM public.sales_v2 s
JOIN public.items_v2 i ON s.id = i.sale_id
WHERE i.category = 'furniture'
LIMIT 5;

-- 4. Test filtering by general category
SELECT 
    s.id,
    s.title,
    i.name as item_name,
    i.category
FROM public.sales_v2 s
JOIN public.items_v2 i ON s.id = i.sale_id
WHERE i.category = 'general'
LIMIT 5;

-- 5. Test multiple categories (OR logic) - this is what the API will use
SELECT 
    s.id,
    s.title,
    i.name as item_name,
    i.category
FROM public.sales_v2 s
JOIN public.items_v2 i ON s.id = i.sale_id
WHERE i.category = ANY(ARRAY['furniture', 'general'])
LIMIT 5;

-- 6. Test the exact query pattern the API endpoints will use
SELECT 
    s.id,
    s.title,
    s.lat,
    s.lng,
    i.name as item_name,
    i.category
FROM public.sales_v2 s
JOIN public.items_v2 i ON s.id = i.sale_id
WHERE i.category = ANY(ARRAY['furniture'])
LIMIT 3;
