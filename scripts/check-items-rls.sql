-- Diagnostic script to check items RLS policies and data
-- Run this in Supabase SQL editor to diagnose the items visibility issue

-- 1. Check if items_owner_read policy exists
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'lootaura_v2'
  AND tablename = 'items'
  AND policyname IN ('items_owner_read', 'items_public_read')
ORDER BY policyname;

-- 2. Check if RLS is enabled on items table
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'lootaura_v2'
  AND tablename = 'items';

-- 3. Count items by sale status (using admin/service role)
-- This will show if items actually exist in the database
SELECT 
    s.status,
    COUNT(i.id) as item_count,
    COUNT(DISTINCT s.id) as sale_count
FROM lootaura_v2.sales s
LEFT JOIN lootaura_v2.items i ON i.sale_id = s.id
GROUP BY s.status
ORDER BY s.status;

-- 4. Sample items to verify they exist
SELECT 
    i.id,
    i.sale_id,
    i.name,
    s.status as sale_status,
    s.owner_id
FROM lootaura_v2.items i
JOIN lootaura_v2.sales s ON s.id = i.sale_id
LIMIT 10;

-- 5. Check if items_v2 view exists and is accessible
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'items_v2';

