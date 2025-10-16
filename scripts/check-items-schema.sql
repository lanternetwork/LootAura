-- Check the actual schema of lootaura_v2.items table
-- This will help us understand what columns are available

-- 1. Check if the table exists
SELECT 
    table_name,
    table_schema
FROM information_schema.tables 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items';

-- 2. List all columns in lootaura_v2.items
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
ORDER BY ordinal_position;

-- 3. Check if there's a categories column (plural)
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
    AND column_name LIKE '%categor%';

-- 4. Sample a few rows to see the actual data structure
SELECT * FROM lootaura_v2.items LIMIT 3;
