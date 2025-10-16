-- Fix items_v2 view to include missing category column
-- This migration updates the public.items_v2 view to include all columns from lootaura_v2.items

-- Drop and recreate the items_v2 view with all columns
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
