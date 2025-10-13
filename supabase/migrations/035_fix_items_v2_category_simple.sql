-- Simple fix: Add only the category column and create the view
-- This is the minimal migration needed for category filtering

-- Add category column to lootaura_v2.items
ALTER TABLE lootaura_v2.items 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Set default category for existing rows
UPDATE lootaura_v2.items 
SET category = 'general'
WHERE category IS NULL;

-- Drop and recreate the items_v2 view
DROP VIEW IF EXISTS public.items_v2 CASCADE;

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

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

-- Verify the view works
SELECT COUNT(*) as item_count FROM public.items_v2;
