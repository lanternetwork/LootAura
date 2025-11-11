-- Add image_url column to items_v2 view
-- The base table has image_url, but the view was missing it

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
    image_url,
    images,
    is_sold,
    updated_at
FROM lootaura_v2.items;

-- Grant permissions on the updated view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

