-- Step-by-step migration to add category column
-- Run each section separately to identify where it fails

-- STEP 1: Add the category column to the base table
ALTER TABLE lootaura_v2.items 
ADD COLUMN IF NOT EXISTS category TEXT;

-- STEP 2: Set default values for existing rows
UPDATE lootaura_v2.items 
SET category = 'general'
WHERE category IS NULL;

-- STEP 3: Verify the column was added
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items'
    AND column_name = 'category';

-- STEP 4: Test querying the base table with category
SELECT 
    id,
    name,
    category
FROM lootaura_v2.items 
LIMIT 3;

-- STEP 5: Drop the existing view if it exists
DROP VIEW IF EXISTS public.items_v2 CASCADE;

-- STEP 6: Create the new view with category column
CREATE VIEW public.items_v2 AS
SELECT 
    id,
    created_at,
    sale_id,
    name,
    description,
    price,
    category,
    image_url,
    created_at as updated_at
FROM lootaura_v2.items;

-- STEP 7: Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

-- STEP 8: Test the view
SELECT COUNT(*) as item_count FROM public.items_v2;
