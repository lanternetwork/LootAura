-- Insert test sales data for Louisville, Nashville, and Atlanta
-- This creates 10 sales with proper coordinates and items

-- Create test users if they don't exist
INSERT INTO auth.users (id, email, encrypted_password, instance_id, aud, role, created_at, updated_at)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'louisville@test.com', 'dummy_password', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NOW(), NOW()),
    ('22222222-2222-2222-2222-222222222222', 'nashville@test.com', 'dummy_password', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NOW(), NOW()),
    ('33333333-3333-3333-3333-333333333333', 'atlanta@test.com', 'dummy_password', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert Louisville sales (around 40204)
INSERT INTO lootaura_v2.sales (
    id, title, description, address, city, state, zip_code, lat, lng,
    date_start, time_start, date_end, time_end, status, owner_id
) VALUES 
(
    '11111111-1111-1111-1111-111111111111', 'Louisville Community Yard Sale', 'Multi-family sale with furniture and electronics',
    '1234 Main St', 'Louisville', 'KY', '40204', 38.235, -85.708,
    '2025-10-11', '09:00:00', '2025-10-11', '15:00:00', 'published', '11111111-1111-1111-1111-111111111111'
),
(
    '11111111-1111-1111-1111-111111111112', 'Louisville Estate Sale', 'Antiques and collectibles',
    '5678 Oak Ave', 'Louisville', 'KY', '40204', 38.245, -85.698,
    '2025-10-12', '10:00:00', '2025-10-12', '16:00:00', 'published', '11111111-1111-1111-1111-111111111111'
),
(
    '11111111-1111-1111-1111-111111111113', 'Louisville Moving Sale', 'Everything must go!',
    '9012 Pine St', 'Louisville', 'KY', '40204', 38.225, -85.718,
    '2025-10-18', '08:00:00', '2025-10-18', '14:00:00', 'published', '11111111-1111-1111-1111-111111111111'
);

-- Insert Nashville sales (around 37206)
INSERT INTO lootaura_v2.sales (
    id, title, description, address, city, state, zip_code, lat, lng,
    date_start, time_start, date_end, time_end, status, owner_id
) VALUES 
(
    '22222222-2222-2222-2222-222222222221', 'Nashville Neighborhood Sale', 'Kids toys and clothing',
    '1234 Music Row', 'Nashville', 'TN', '37206', 36.18, -86.74,
    '2025-10-11', '09:00:00', '2025-10-11', '15:00:00', 'published', '22222222-2222-2222-2222-222222222222'
),
(
    '22222222-2222-2222-2222-222222222223', 'Nashville Vintage Sale', 'Retro clothing and records',
    '5678 Broadway', 'Nashville', 'TN', '37206', 36.19, -86.73,
    '2025-10-12', '10:00:00', '2025-10-12', '16:00:00', 'published', '22222222-2222-2222-2222-222222222222'
),
(
    '22222222-2222-2222-2222-222222222224', 'Nashville Garage Sale', 'Tools and home goods',
    '9012 Church St', 'Nashville', 'TN', '37206', 36.17, -86.75,
    '2025-10-18', '08:00:00', '2025-10-18', '14:00:00', 'published', '22222222-2222-2222-2222-222222222222'
);

-- Insert Atlanta sales (around 30307)
INSERT INTO lootaura_v2.sales (
    id, title, description, address, city, state, zip_code, lat, lng,
    date_start, time_start, date_end, time_end, status, owner_id
) VALUES 
(
    '33333333-3333-3333-3333-333333333331', 'Atlanta Community Sale', 'Furniture and electronics',
    '1234 Peachtree St', 'Atlanta', 'GA', '30307', 33.761, -84.352,
    '2025-10-11', '09:00:00', '2025-10-11', '15:00:00', 'published', '33333333-3333-3333-3333-333333333333'
),
(
    '33333333-3333-3333-3333-333333333332', 'Atlanta Estate Sale', 'Art and antiques',
    '5678 Piedmont Ave', 'Atlanta', 'GA', '30307', 33.771, -84.342,
    '2025-10-12', '10:00:00', '2025-10-12', '16:00:00', 'published', '33333333-3333-3333-3333-333333333333'
),
(
    '33333333-3333-3333-3333-333333333334', 'Atlanta Moving Sale', 'Household items',
    '9012 Spring St', 'Atlanta', 'GA', '30307', 33.751, -84.362,
    '2025-10-18', '08:00:00', '2025-10-18', '14:00:00', 'published', '33333333-3333-3333-3333-333333333333'
),
(
    '33333333-3333-3333-3333-333333333335', 'Atlanta Weekend Sale', 'Books and media',
    '3456 10th St', 'Atlanta', 'GA', '30307', 33.755, -84.355,
    '2025-10-19', '09:00:00', '2025-10-19', '15:00:00', 'published', '33333333-3333-3333-3333-333333333333'
);

-- Insert items for each sale (2 items each)
INSERT INTO lootaura_v2.items (sale_id, name, description, price) VALUES 
-- Louisville items
('11111111-1111-1111-1111-111111111111', 'Vintage Chair', 'Comfortable armchair, good condition', 25.00),
('11111111-1111-1111-1111-111111111111', 'Coffee Table', 'Wooden coffee table with storage', 45.00),
('11111111-1111-1111-1111-111111111112', 'Antique Lamp', 'Brass table lamp, working', 35.00),
('11111111-1111-1111-1111-111111111112', 'Vintage Vase', 'Ceramic decorative vase', 15.00),
('11111111-1111-1111-1111-111111111113', 'Dining Table', '6-person dining table', 120.00),
('11111111-1111-1111-1111-111111111113', 'Bookshelf', '5-shelf wooden bookshelf', 60.00),

-- Nashville items
('22222222-2222-2222-2222-222222222221', 'Kids Bike', '12-inch bike, blue', 30.00),
('22222222-2222-2222-2222-222222222221', 'Toy Box', 'Wooden toy storage box', 25.00),
('22222222-2222-2222-2222-222222222223', 'Vintage Jacket', 'Leather jacket, size M', 40.00),
('22222222-2222-2222-2222-222222222223', 'Record Player', 'Working turntable', 80.00),
('22222222-2222-2222-2222-222222222224', 'Tool Set', 'Complete hand tool set', 50.00),
('22222222-2222-2222-2222-222222222224', 'Garden Tools', 'Shovels, rakes, and more', 35.00),

-- Atlanta items
('33333333-3333-3333-3333-333333333331', 'Sofa', '3-seat sofa, beige', 150.00),
('33333333-3333-3333-3333-333333333331', 'TV Stand', 'Wooden entertainment center', 75.00),
('33333333-3333-3333-3333-333333333332', 'Painting', 'Original artwork, framed', 200.00),
('33333333-3333-3333-3333-333333333332', 'Antique Clock', 'Mantle clock, working', 90.00),
('33333333-3333-3333-3333-333333333334', 'Kitchen Set', 'Dishes, glasses, silverware', 40.00),
('33333333-3333-3333-3333-333333333334', 'Bedding Set', 'Queen size comforter set', 30.00),
('33333333-3333-3333-3333-333333333335', 'Book Collection', 'Mystery novels, 20 books', 25.00),
('33333333-3333-3333-3333-333333333335', 'DVD Collection', 'Movies and TV shows', 15.00);

-- Verify the data was inserted
DO $$
DECLARE
    sales_count integer;
    items_count integer;
BEGIN
    SELECT COUNT(*) INTO sales_count FROM lootaura_v2.sales;
    SELECT COUNT(*) INTO items_count FROM lootaura_v2.items;
    
    RAISE NOTICE 'Test data inserted successfully!';
    RAISE NOTICE 'Sales: %, Items: %', sales_count, items_count;
END $$;
