-- Check if items actually exist in the database
-- Run this with service role or admin access to bypass RLS

-- 1. Count total items in base table (bypasses RLS)
SELECT COUNT(*) as total_items
FROM lootaura_v2.items;

-- 2. Count items by sale status
SELECT 
    s.status,
    COUNT(i.id) as item_count,
    COUNT(DISTINCT s.id) as sale_count
FROM lootaura_v2.sales s
LEFT JOIN lootaura_v2.items i ON i.sale_id = s.id
GROUP BY s.status
ORDER BY s.status;

-- 3. Show sample items with their sale info
SELECT 
    i.id as item_id,
    i.sale_id,
    i.name as item_name,
    s.status as sale_status,
    s.owner_id,
    s.title as sale_title
FROM lootaura_v2.items i
JOIN lootaura_v2.sales s ON s.id = i.sale_id
ORDER BY i.created_at DESC
LIMIT 20;

-- 4. Check items_v2 view (this is what the app uses)
SELECT COUNT(*) as items_v2_count
FROM public.items_v2;

-- 5. Sample from items_v2 view
SELECT 
    id,
    sale_id,
    name,
    price,
    image_url
FROM public.items_v2
ORDER BY created_at DESC
LIMIT 10;

-- 6. Check RLS policies on items table
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'lootaura_v2'
  AND tablename = 'items'
ORDER BY policyname;

