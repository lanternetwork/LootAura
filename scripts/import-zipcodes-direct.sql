-- Direct SQL import for ZIP codes
-- Run this in Supabase SQL Editor after creating a temporary table with your CSV data
-- 
-- Step 1: Create a temporary table from your CSV data
-- Copy your CSV data and paste it into a temporary table or use COPY command

-- Step 2: If your table uses 'zip' column:
INSERT INTO lootaura_v2.zipcodes (zip, lat, lng, city, state)
SELECT 
  LPAD(REGEXP_REPLACE("Zip Code", '[^0-9]', '', 'g'), 5, '0') as zip,
  (SPLIT_PART("Geo Point", ',', 1))::DOUBLE PRECISION as lat,
  (SPLIT_PART("Geo Point", ',', 2))::DOUBLE PRECISION as lng,
  "Official USPS city name" as city,
  "Official USPS State Code" as state
FROM temp_zipcodes_csv
WHERE "Zip Code" IS NOT NULL 
  AND "Geo Point" IS NOT NULL
  AND SPLIT_PART("Geo Point", ',', 1) ~ '^[0-9]+\.?[0-9]*$'
  AND SPLIT_PART("Geo Point", ',', 2) ~ '^-?[0-9]+\.?[0-9]*$'
ON CONFLICT (zip) DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  updated_at = NOW();

-- Alternative if your table uses 'zip_code' column:
-- INSERT INTO lootaura_v2.zipcodes (zip_code, lat, lng, city, state)
-- SELECT 
--   LPAD(REGEXP_REPLACE("Zip Code", '[^0-9]', '', 'g'), 5, '0') as zip_code,
--   (SPLIT_PART("Geo Point", ',', 1))::DOUBLE PRECISION as lat,
--   (SPLIT_PART("Geo Point", ',', 2))::DOUBLE PRECISION as lng,
--   "Official USPS city name" as city,
--   "Official USPS State Code" as state
-- FROM temp_zipcodes_csv
-- WHERE "Zip Code" IS NOT NULL 
--   AND "Geo Point" IS NOT NULL
-- ON CONFLICT (zip_code) DO UPDATE SET
--   lat = EXCLUDED.lat,
--   lng = EXCLUDED.lng,
--   city = EXCLUDED.city,
--   state = EXCLUDED.state,
--   updated_at = NOW();

