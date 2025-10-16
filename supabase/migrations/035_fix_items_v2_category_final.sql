-- Fix items_v2 view to include category column
-- Based on actual schema: id, created_at, sale_id, name, description, price, image_url

-- Add missing columns to lootaura_v2.items table
ALTER TABLE lootaura_v2.items 
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS condition TEXT,
ADD COLUMN IF NOT EXISTS images TEXT[],
ADD COLUMN IF NOT EXISTS is_sold BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Set default values for existing rows
UPDATE lootaura_v2.items 
SET 
    category = CASE 
        WHEN name ILIKE '%chair%' OR name ILIKE '%table%' OR name ILIKE '%furniture%' THEN 'furniture'
        WHEN name ILIKE '%tool%' OR name ILIKE '%drill%' OR name ILIKE '%hammer%' THEN 'tools'
        WHEN name ILIKE '%toy%' OR name ILIKE '%game%' THEN 'toys'
        WHEN name ILIKE '%book%' OR name ILIKE '%magazine%' THEN 'books'
        WHEN name ILIKE '%cloth%' OR name ILIKE '%shirt%' OR name ILIKE '%dress%' THEN 'clothing'
        ELSE 'general'
    END,
    condition = 'good',
    is_sold = FALSE,
    updated_at = NOW()
WHERE category IS NULL;

-- Now drop and recreate the items_v2 view with all columns
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
    condition,
    images,
    is_sold,
    updated_at
FROM lootaura_v2.items;

-- Grant permissions on the updated view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

-- Verify the view has the category column
DO $$
DECLARE
    column_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'items_v2' 
        AND column_name = 'category'
    ) INTO column_exists;
    
    IF column_exists THEN
        RAISE NOTICE 'items_v2 view successfully updated with category column';
    ELSE
        RAISE EXCEPTION 'items_v2 view update failed - category column not found';
    END IF;
END $$;
