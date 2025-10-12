-- Fix reviews_v2 view to include address column
-- Run this in Supabase SQL Editor

-- Drop and recreate the reviews_v2 view with address column
DROP VIEW IF EXISTS public.reviews_v2 CASCADE;

CREATE VIEW public.reviews_v2 AS
SELECT 
    id, created_at, review_key, sale_id, user_id, seller_id, address_key, username_display, rating, comment, address
FROM lootaura_v2.reviews;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews_v2 TO anon, authenticated;

-- Verify the view works
DO $$
DECLARE
    column_count integer;
BEGIN
    SELECT COUNT(*) INTO column_count 
    FROM information_schema.columns 
    WHERE table_name = 'reviews_v2' AND table_schema = 'public';
    
    RAISE NOTICE 'Reviews_v2 view updated with % columns', column_count;
END $$;
