-- Simple dual-link review system migration
-- Run this in Supabase SQL editor

-- 1. Add address_key column to sales table
ALTER TABLE lootaura_v2.sales ADD COLUMN IF NOT EXISTS address_key TEXT;

-- 2. Create function to normalize address
CREATE OR REPLACE FUNCTION lootaura_v2.normalize_address(
    p_address TEXT,
    p_city TEXT,
    p_state TEXT,
    p_zip_code TEXT
) RETURNS TEXT AS $$
DECLARE
    normalized_address TEXT;
BEGIN
    -- Normalize address: lowercase, trim, remove extra spaces, remove unit numbers
    normalized_address := LOWER(TRIM(COALESCE(p_address, '')));
    
    -- Remove common unit indicators (apt, unit, #, etc.)
    normalized_address := REGEXP_REPLACE(normalized_address, '\s+(apt|apartment|unit|#|suite|ste)\s*[a-z0-9-]*', '', 'gi');
    
    -- Remove extra spaces and normalize
    normalized_address := REGEXP_REPLACE(normalized_address, '\s+', ' ', 'g');
    normalized_address := TRIM(normalized_address);
    
    -- Combine with city, state, zip for unique key
    normalized_address := normalized_address || '|' || LOWER(TRIM(COALESCE(p_city, ''))) || '|' || UPPER(TRIM(COALESCE(p_state, ''))) || '|' || TRIM(COALESCE(p_zip_code, ''));
    
    RETURN normalized_address;
END;
$$ LANGUAGE plpgsql;

-- 3. Update existing sales with address_key
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE address_key IS NULL;

-- 4. Add columns to reviews table
ALTER TABLE lootaura_v2.reviews 
ADD COLUMN IF NOT EXISTS review_key TEXT,
ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS address_key TEXT,
ADD COLUMN IF NOT EXISTS username_display TEXT,
ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE;

-- 5. Create function to compute review_key
CREATE OR REPLACE FUNCTION lootaura_v2.compute_review_key(
    p_address_key TEXT,
    p_seller_id UUID
) RETURNS TEXT AS $$
BEGIN
    RETURN p_address_key || '|' || p_seller_id::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS sales_address_key_idx ON lootaura_v2.sales (address_key);
CREATE INDEX IF NOT EXISTS reviews_review_key_idx ON lootaura_v2.reviews (review_key);
CREATE INDEX IF NOT EXISTS reviews_address_key_idx ON lootaura_v2.reviews (address_key);
CREATE INDEX IF NOT EXISTS reviews_seller_id_idx ON lootaura_v2.reviews (seller_id);

-- 7. Update public views to include new columns
DROP VIEW IF EXISTS public.sales_v2 CASCADE;
CREATE VIEW public.sales_v2 AS
SELECT 
    id, created_at, updated_at, owner_id, title, description, address, city, state, zip_code, address_key,
    lat, lng, geom, date_start, time_start, date_end, time_end, starts_at, status, is_featured
FROM lootaura_v2.sales;

DROP VIEW IF EXISTS public.reviews_v2 CASCADE;
CREATE VIEW public.reviews_v2 AS
SELECT 
    id, created_at, review_key, sale_id, user_id, seller_id, address_key, username_display, rating, comment
FROM lootaura_v2.reviews;

-- 8. Grant permissions on new views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews_v2 TO anon, authenticated;

-- 9. Verify the setup
DO $$
DECLARE
    sales_count integer;
    address_key_count integer;
BEGIN
    SELECT COUNT(*) INTO sales_count FROM lootaura_v2.sales;
    SELECT COUNT(*) INTO address_key_count FROM lootaura_v2.sales WHERE address_key IS NOT NULL;
    
    RAISE NOTICE 'Dual-link review system migration complete!';
    RAISE NOTICE 'Total sales: %, Sales with address_key: %', sales_count, address_key_count;
END $$;
