-- Dual-link review system: reviews key off (normalized address_key + seller_id)
-- This ensures same address with different accounts do not share reviews

-- 1. Add address_key column to sales table
ALTER TABLE lootaura_v2.sales 
ADD COLUMN IF NOT EXISTS address_key TEXT;

-- 2. Create function to normalize address for address_key
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

-- 3. Create trigger function to set address_key on insert/update
CREATE OR REPLACE FUNCTION lootaura_v2.set_address_key()
RETURNS TRIGGER AS $$
BEGIN
    NEW.address_key := lootaura_v2.normalize_address(NEW.address, NEW.city, NEW.state, NEW.zip_code);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger for sales table
DROP TRIGGER IF EXISTS sales_set_address_key_trigger ON lootaura_v2.sales;
CREATE TRIGGER sales_set_address_key_trigger
    BEFORE INSERT OR UPDATE ON lootaura_v2.sales
    FOR EACH ROW
    EXECUTE FUNCTION lootaura_v2.set_address_key();

-- 5. Update existing sales with address_key
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE address_key IS NULL;

-- 6. Add columns to reviews table
ALTER TABLE lootaura_v2.reviews 
ADD COLUMN IF NOT EXISTS review_key TEXT,
ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS address_key TEXT,
ADD COLUMN IF NOT EXISTS username_display TEXT,
ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE;

-- 7. Create function to compute review_key
CREATE OR REPLACE FUNCTION lootaura_v2.compute_review_key(
    p_address_key TEXT,
    p_seller_id UUID
) RETURNS TEXT AS $$
BEGIN
    RETURN p_address_key || '|' || p_seller_id::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger function to set review_key on insert/update
CREATE OR REPLACE FUNCTION lootaura_v2.set_review_key()
RETURNS TRIGGER AS $$
DECLARE
    sale_address_key TEXT;
    sale_owner_id UUID;
BEGIN
    -- Get address_key and owner_id from the sale
    SELECT s.address_key, s.owner_id 
    INTO sale_address_key, sale_owner_id
    FROM lootaura_v2.sales s 
    WHERE s.id = NEW.sale_id;
    
    -- Set the review fields
    NEW.address_key := sale_address_key;
    NEW.seller_id := sale_owner_id;
    NEW.review_key := lootaura_v2.compute_review_key(sale_address_key, sale_owner_id);
    
    -- Get username for display
    SELECT p.username INTO NEW.username_display
    FROM lootaura_v2.profiles p 
    WHERE p.id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger for reviews table
DROP TRIGGER IF EXISTS reviews_set_review_key_trigger ON lootaura_v2.reviews;
CREATE TRIGGER reviews_set_review_key_trigger
    BEFORE INSERT OR UPDATE ON lootaura_v2.reviews
    FOR EACH ROW
    EXECUTE FUNCTION lootaura_v2.set_review_key();

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS sales_address_key_idx ON lootaura_v2.sales (address_key);
CREATE INDEX IF NOT EXISTS reviews_review_key_idx ON lootaura_v2.reviews (review_key);
CREATE INDEX IF NOT EXISTS reviews_address_key_idx ON lootaura_v2.reviews (address_key);
CREATE INDEX IF NOT EXISTS reviews_seller_id_idx ON lootaura_v2.reviews (seller_id);

-- 11. Update existing reviews with new fields (if any exist)
UPDATE lootaura_v2.reviews r
SET 
    address_key = s.address_key,
    seller_id = s.owner_id,
    review_key = lootaura_v2.compute_review_key(s.address_key, s.owner_id),
    username_display = COALESCE(p.username, 'Anonymous')
FROM lootaura_v2.sales s
LEFT JOIN lootaura_v2.profiles p ON p.id = r.user_id
WHERE r.sale_id = s.id
AND (r.address_key IS NULL OR r.seller_id IS NULL OR r.review_key IS NULL);

-- 12. Update public views to include new columns
DROP VIEW IF EXISTS public.sales_v2 CASCADE;
CREATE VIEW public.sales_v2 AS
SELECT 
    id,
    created_at,
    updated_at,
    owner_id,
    title,
    description,
    address,
    city,
    state,
    zip_code,
    address_key,
    lat,
    lng,
    geom,
    date_start,
    time_start,
    date_end,
    time_end,
    starts_at,
    status,
    is_featured
FROM lootaura_v2.sales;

-- 13. Create reviews_v2 view
DROP VIEW IF EXISTS public.reviews_v2 CASCADE;
CREATE VIEW public.reviews_v2 AS
SELECT 
    id,
    created_at,
    review_key,
    sale_id,
    user_id,
    seller_id,
    address_key,
    username_display,
    rating,
    comment
FROM lootaura_v2.reviews;

-- 14. Grant permissions on new views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews_v2 TO anon, authenticated;

-- 15. Verify the setup
DO $$
DECLARE
    sales_count integer;
    reviews_count integer;
BEGIN
    SELECT COUNT(*) INTO sales_count FROM lootaura_v2.sales WHERE address_key IS NOT NULL;
    SELECT COUNT(*) INTO reviews_count FROM lootaura_v2.reviews;
    
    RAISE NOTICE 'Dual-link review system setup complete!';
    RAISE NOTICE 'Sales with address_key: %, Reviews: %', sales_count, reviews_count;
END $$;
