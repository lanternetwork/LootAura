-- Diagnostic script to understand the category column issue
-- Run this first to understand the current database state

-- 1. Check if lootaura_v2.items table exists
SELECT 
    'Table exists' as check_type,
    table_name,
    table_schema
FROM information_schema.tables 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items';

-- 2. List ALL columns in lootaura_v2.items
SELECT 
    'All columns' as check_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
ORDER BY ordinal_position;

-- 3. Check for any category-related columns
SELECT 
    'Category columns' as check_type,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
    AND (column_name ILIKE '%categor%' OR column_name ILIKE '%type%' OR column_name ILIKE '%class%');

-- 4. Check if public.items_v2 view exists
SELECT 
    'View exists' as check_type,
    table_name,
    table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name = 'items_v2';

-- 5. If the view exists, check its columns
SELECT 
    'View columns' as check_type,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'items_v2'
ORDER BY ordinal_position;

-- 6. Sample data from lootaura_v2.items (if it exists)
SELECT 
    'Sample data' as check_type,
    *
FROM lootaura_v2.items 
LIMIT 2;
