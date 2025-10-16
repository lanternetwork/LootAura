-- Check the exact structure of lootaura_v2.items
-- This will show us all columns and help identify the issue

-- 1. List ALL columns in lootaura_v2.items
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
ORDER BY ordinal_position;

-- 2. Check if the table exists at all
SELECT 
    table_name,
    table_schema,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items';

-- 3. Try to add the category column manually
-- (This will show us if there's a permissions issue)
ALTER TABLE lootaura_v2.items 
ADD COLUMN IF NOT EXISTS category TEXT;

-- 4. Check if the column was added
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
    AND column_name = 'category';

-- 5. If the column exists, set default values
UPDATE lootaura_v2.items 
SET category = 'general'
WHERE category IS NULL;

-- 6. Test the column
SELECT 
    id,
    name,
    category
FROM lootaura_v2.items 
LIMIT 3;
