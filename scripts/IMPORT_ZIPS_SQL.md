# Direct SQL Import for ZIP Codes

Since the web import is having issues, here's the SQL you can paste directly into Supabase SQL Editor.

## Option 1: Import via CSV Upload in Supabase

1. Go to Supabase Dashboard → Table Editor → `lootaura_v2.zipcodes`
2. Click "Insert" → "Import data via CSV"
3. Upload your CSV file
4. Map columns:
   - CSV "Zip Code" → `zip_code`
   - CSV "Official USPS city name" → `city`
   - CSV "Official USPS State Code" → `state`
   - CSV "Geo Point" → Parse into `lat` and `lng` (see Option 2)

## Option 2: Create Table from CSV Then Import

First, create a temporary table from your CSV:

```sql
-- Step 1: Create temporary table (adjust column names to match your CSV exactly)
CREATE TEMP TABLE temp_zips (
  zip_code_temp TEXT,
  city_temp TEXT,
  state_temp TEXT,
  geo_point_temp TEXT
);

-- Step 2: Import CSV data into temp table using Supabase's CSV import tool
-- OR manually insert first few rows to test

-- Step 3: Insert into actual table, parsing Geo Point
INSERT INTO lootaura_v2.zipcodes (zip_code, lat, lng, city, state)
SELECT 
  LPAD(REGEXP_REPLACE(zip_code_temp, '[^0-9]', '', 'g'), 5, '0') as zip_code,
  (SPLIT_PART(TRIM(geo_point_temp), ',', 1))::DOUBLE PRECISION as lat,
  (SPLIT_PART(TRIM(geo_point_temp), ',', 2))::DOUBLE PRECISION as lng,
  city_temp as city,
  state_temp as state
FROM temp_zips
WHERE zip_code_temp IS NOT NULL 
  AND geo_point_temp IS NOT NULL
  AND geo_point_temp ~ '^-?[0-9]+\.[0-9]+, *-?[0-9]+\.[0-9]+$'
ON CONFLICT (zip_code) DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  updated_at = NOW();
```

## Option 3: Direct INSERT with Sample Data (Test First)

Test with a few rows first:

```sql
INSERT INTO lootaura_v2.zipcodes (zip_code, lat, lng, city, state)
VALUES 
  ('61744', 40.73997, -88.8871, 'Gridley', 'IL'),
  ('63334', 39.30166, -91.18781, 'Bowling Green', 'MO'),
  ('64855', 37.29597, -94.48582, 'Oronogo', 'MO')
ON CONFLICT (zip_code) DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  updated_at = NOW();
```

## Option 4: Use Supabase's REST API Directly

You can also use the Supabase REST API from a script or Postman:

```
POST https://YOUR_PROJECT.supabase.co/rest/v1/lootaura_v2.zipcodes
Headers:
  apikey: YOUR_SERVICE_ROLE_KEY
  Authorization: Bearer YOUR_SERVICE_ROLE_KEY
  Content-Type: application/json
  Prefer: resolution=merge-duplicates

Body (array):
[
  {
    "zip_code": "61744",
    "lat": 40.73997,
    "lng": -88.8871,
    "city": "Gridley",
    "state": "IL"
  },
  ...
]
```

## Quick Fix for Current Code

The table column is `zip_code` but the code was using `zip`. I've fixed that in the route file.

