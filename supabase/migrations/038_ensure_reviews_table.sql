-- Ensure reviews table exists for dual-link review system
-- Run this in Supabase SQL editor

-- 1. Create reviews table if it doesn't exist
CREATE TABLE IF NOT EXISTS lootaura_v2.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE
);

-- 2. Add new columns for dual-link system
ALTER TABLE lootaura_v2.reviews 
ADD COLUMN IF NOT EXISTS review_key TEXT,
ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS address_key TEXT,
ADD COLUMN IF NOT EXISTS username_display TEXT;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS reviews_review_key_idx ON lootaura_v2.reviews (review_key);
CREATE INDEX IF NOT EXISTS reviews_address_key_idx ON lootaura_v2.reviews (address_key);
CREATE INDEX IF NOT EXISTS reviews_seller_id_idx ON lootaura_v2.reviews (seller_id);
CREATE INDEX IF NOT EXISTS reviews_sale_id_idx ON lootaura_v2.reviews (sale_id);

-- 4. Update public views to include new columns
DROP VIEW IF EXISTS public.reviews_v2 CASCADE;
CREATE VIEW public.reviews_v2 AS
SELECT 
    id, created_at, review_key, sale_id, user_id, seller_id, address_key, username_display, rating, comment
FROM lootaura_v2.reviews;

-- 5. Grant permissions on new views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews_v2 TO anon, authenticated;

-- 6. Verify the setup
DO $$
DECLARE
    reviews_count integer;
BEGIN
    SELECT COUNT(*) INTO reviews_count FROM lootaura_v2.reviews;
    
    RAISE NOTICE 'Reviews table setup complete!';
    RAISE NOTICE 'Total reviews: %', reviews_count;
END $$;
