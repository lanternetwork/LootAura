-- Seed test data for Louisville area (38.24, -85.75)
-- This ensures we have test data within 25 miles of Louisville

-- Insert test sales in Louisville area
INSERT INTO lootaura_v2.sales (
    id,
    owner_id,
    title,
    description,
    address,
    city,
    state,
    zip_code,
    lat,
    lng,
    geom,
    date_start,
    time_start,
    date_end,
    time_end,
    starts_at,
    status,
    is_featured,
    created_at,
    updated_at
) VALUES 
-- Sale 1: Downtown Louisville (38.25, -85.76)
(
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid, -- Anonymous user
    'Downtown Louisville Yard Sale',
    'Great selection of furniture, electronics, and household items. Everything must go!',
    '123 Main St',
    'Louisville',
    'KY',
    '40202',
    38.25,
    -85.76,
    ST_SetSRID(ST_MakePoint(-85.76, 38.25), 4326),
    CURRENT_DATE,
    '08:00:00',
    CURRENT_DATE,
    '16:00:00',
    CURRENT_TIMESTAMP + INTERVAL '1 day',
    'published',
    false,
    NOW(),
    NOW()
),
-- Sale 2: East Louisville (38.22, -85.70)
(
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'East Louisville Estate Sale',
    'Antiques, collectibles, and vintage items. Estate sale with unique finds.',
    '456 Oak Ave',
    'Louisville',
    'KY',
    '40204',
    38.22,
    -85.70,
    ST_SetSRID(ST_MakePoint(-85.70, 38.22), 4326),
    CURRENT_DATE + INTERVAL '2 days',
    '09:00:00',
    CURRENT_DATE + INTERVAL '2 days',
    '17:00:00',
    CURRENT_TIMESTAMP + INTERVAL '2 days',
    'published',
    true,
    NOW(),
    NOW()
),
-- Sale 3: West Louisville (38.26, -85.80)
(
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'West Louisville Community Sale',
    'Multi-family yard sale with toys, books, and home goods.',
    '789 Pine St',
    'Louisville',
    'KY',
    '40210',
    38.26,
    -85.80,
    ST_SetSRID(ST_MakePoint(-85.80, 38.26), 4326),
    CURRENT_DATE + INTERVAL '3 days',
    '07:00:00',
    CURRENT_DATE + INTERVAL '3 days',
    '15:00:00',
    CURRENT_TIMESTAMP + INTERVAL '3 days',
    'published',
    false,
    NOW(),
    NOW()
),
-- Sale 4: This Weekend Sale (38.24, -85.75) - Exact Louisville center
(
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'This Weekend Mega Sale',
    'Huge yard sale with everything from tools to clothing. Cash only.',
    '321 Broadway',
    'Louisville',
    'KY',
    '40201',
    38.24,
    -85.75,
    ST_SetSRID(ST_MakePoint(-85.75, 38.24), 4326),
    CURRENT_DATE + INTERVAL '1 day', -- This weekend
    '08:00:00',
    CURRENT_DATE + INTERVAL '2 days',
    '18:00:00',
    CURRENT_TIMESTAMP + INTERVAL '1 day',
    'published',
    true,
    NOW(),
    NOW()
),
-- Sale 5: Next Weekend Sale (38.23, -85.74)
(
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'Next Weekend Electronics Sale',
    'Electronics, computers, and tech gadgets. All items tested and working.',
    '654 Tech Blvd',
    'Louisville',
    'KY',
    '40203',
    38.23,
    -85.74,
    ST_SetSRID(ST_MakePoint(-85.74, 38.23), 4326),
    CURRENT_DATE + INTERVAL '7 days', -- Next weekend
    '10:00:00',
    CURRENT_DATE + INTERVAL '8 days',
    '16:00:00',
    CURRENT_TIMESTAMP + INTERVAL '7 days',
    'published',
    false,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Verify the test data was inserted
DO $$
DECLARE
    sales_count integer;
BEGIN
    SELECT COUNT(*) INTO sales_count FROM lootaura_v2.sales WHERE city = 'Louisville';
    RAISE NOTICE 'Inserted % Louisville test sales', sales_count;
    
    -- Test distance calculation for Louisville center
    SELECT COUNT(*) INTO sales_count 
    FROM lootaura_v2.sales 
    WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(-85.75, 38.24), 4326),
        geom,
        40000 -- 40km in meters
    );
    RAISE NOTICE 'Sales within 40km of Louisville center: %', sales_count;
END $$;
