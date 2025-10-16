-- Alternative approach: Create a view with a computed category column
-- This doesn't require altering the base table

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.items_v2 CASCADE;

-- Create view with computed category based on item name
CREATE VIEW public.items_v2 AS
SELECT 
    id,
    created_at,
    sale_id,
    name,
    description,
    price,
    CASE 
        WHEN name ILIKE '%chair%' OR name ILIKE '%table%' OR name ILIKE '%furniture%' OR name ILIKE '%sofa%' OR name ILIKE '%desk%' THEN 'furniture'
        WHEN name ILIKE '%tool%' OR name ILIKE '%drill%' OR name ILIKE '%hammer%' OR name ILIKE '%saw%' OR name ILIKE '%wrench%' THEN 'tools'
        WHEN name ILIKE '%toy%' OR name ILIKE '%game%' OR name ILIKE '%doll%' OR name ILIKE '%puzzle%' THEN 'toys'
        WHEN name ILIKE '%book%' OR name ILIKE '%magazine%' OR name ILIKE '%novel%' THEN 'books'
        WHEN name ILIKE '%cloth%' OR name ILIKE '%shirt%' OR name ILIKE '%dress%' OR name ILIKE '%pants%' THEN 'clothing'
        WHEN name ILIKE '%electronic%' OR name ILIKE '%phone%' OR name ILIKE '%computer%' OR name ILIKE '%tv%' THEN 'electronics'
        ELSE 'general'
    END as category,
    image_url,
    created_at as updated_at
FROM lootaura_v2.items;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

-- Test the view
SELECT 
    id,
    name,
    category
FROM public.items_v2 
LIMIT 5;
