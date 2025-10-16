-- Verify what actually happened with the migration
-- This will help us understand the current state

-- 1. Check if lootaura_v2.items has the category column
SELECT 
    'lootaura_v2.items columns' as check_type,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
ORDER BY ordinal_position;

-- 2. Check if public.items_v2 view exists
SELECT 
    'public.items_v2 exists' as check_type,
    table_name,
    table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name = 'items_v2';

-- 3. If the view exists, check its columns
SELECT 
    'public.items_v2 columns' as check_type,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'items_v2'
ORDER BY ordinal_position;

-- 4. Check if we can query the base table directly
SELECT 
    'Base table sample' as check_type,
    id,
    name,
    price
FROM lootaura_v2.items 
LIMIT 2;
