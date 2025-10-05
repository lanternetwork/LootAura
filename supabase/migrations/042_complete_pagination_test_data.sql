-- Complete pagination test data - 75 sales around Louisville, KY
-- Run this in Supabase SQL Editor

-- Clear existing test data first
DELETE FROM lootaura_v2.sales WHERE title LIKE 'Test Sale%';

-- Create 75 test sales with varied dates and locations around Louisville
-- Using a more efficient approach with a loop
DO $$
DECLARE
    i INTEGER;
    base_lat DECIMAL := 38.2527;
    base_lng DECIMAL := -85.7585;
    sale_lat DECIMAL;
    sale_lng DECIMAL;
    sale_date DATE;
    sale_time TIME;
    neighborhoods TEXT[] := ARRAY['Downtown', 'Highlands', 'St. Matthews', 'Crescent Hill', 'Clifton', 'Germantown', 'Butchertown', 'NuLu', 'Old Louisville', 'Cherokee Triangle'];
    streets TEXT[] := ARRAY['Main St', 'Bardstown Rd', 'Shelbyville Rd', 'Frankfort Ave', 'Brownsboro Rd', 'Goss Ave', 'E Main St', 'E Market St', '4th St', 'Cherokee Rd'];
    descriptions TEXT[] := ARRAY['Great items for sale', 'Antiques and collectibles', 'Furniture and home goods', 'Books and electronics', 'Tools and equipment', 'Clothing and accessories', 'Kitchen items and cookware', 'Art and decor', 'Vintage items', 'Garden supplies'];
BEGIN
    FOR i IN 1..75 LOOP
        -- Generate random coordinates within ~10km of Louisville
        sale_lat := base_lat + (RANDOM() - 0.5) * 0.1;
        sale_lng := base_lng + (RANDOM() - 0.5) * 0.1;
        
        -- Generate dates over the next 4 weekends
        sale_date := '2025-10-11'::DATE + (i / 10) * INTERVAL '7 days';
        
        -- Generate random times between 8 AM and 6 PM
        sale_time := '08:00:00'::TIME + (RANDOM() * 10) * INTERVAL '1 hour';
        
        -- Insert the sale
        INSERT INTO lootaura_v2.sales (
            id, owner_id, title, description, address, city, state, zip_code, 
            lat, lng, date_start, time_start, date_end, time_end, status, created_at
        ) VALUES (
            'test-sale-' || LPAD(i::TEXT, 3, '0'),
            '11111111-1111-1111-1111-111111111111',
            'Test Sale ' || LPAD(i::TEXT, 3, '0') || ' - ' || neighborhoods[1 + (i % array_length(neighborhoods, 1))],
            descriptions[1 + (i % array_length(descriptions, 1))],
            (100 + i) || ' ' || streets[1 + (i % array_length(streets, 1))],
            'Louisville',
            'KY',
            '4020' || (2 + (i % 8)),
            sale_lat,
            sale_lng,
            sale_date,
            sale_time,
            sale_date,
            sale_time + INTERVAL '8 hours',
            'published',
            NOW() - (RANDOM() * 30) * INTERVAL '1 day'
        );
    END LOOP;
END $$;

-- Update address_key for all test sales
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE title LIKE 'Test Sale%';

-- Verify the data
SELECT COUNT(*) as total_test_sales FROM lootaura_v2.sales WHERE title LIKE 'Test Sale%';
