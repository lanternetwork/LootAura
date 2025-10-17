-- Create comprehensive test data with sales and items for category filtering
-- This ensures we have sales with items in each category

-- Clear any existing comprehensive test data
DELETE FROM lootaura_v2.items WHERE sale_id IN (SELECT id FROM lootaura_v2.sales WHERE title LIKE 'Category Test%');
DELETE FROM lootaura_v2.sales WHERE title LIKE 'Category Test%';

-- Create test sales with specific categories
INSERT INTO lootaura_v2.sales (
    id, owner_id, title, description, address, city, state, zip_code, 
    lat, lng, date_start, time_start, date_end, time_end, status, created_at
) VALUES 
-- Furniture category
('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Category Test - Furniture Sale', 'Sofas, tables, chairs, and bedroom sets', '1001 Furniture Ave', 'Louisville', 'KY', '40204', 38.235, -85.708, '2025-10-11', '09:00:00', '2025-10-11', '17:00:00', 'published', NOW()),

-- Electronics category  
('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Category Test - Electronics Sale', 'TVs, computers, phones, and gadgets', '1002 Tech St', 'Louisville', 'KY', '40204', 38.240, -85.710, '2025-10-11', '10:00:00', '2025-10-11', '18:00:00', 'published', NOW()),

-- Tools category
('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Category Test - Tools Sale', 'Power tools, hand tools, and workshop equipment', '1003 Workshop Rd', 'Louisville', 'KY', '40204', 38.230, -85.705, '2025-10-12', '08:00:00', '2025-10-12', '16:00:00', 'published', NOW()),

-- Toys category
('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Category Test - Toys Sale', 'Action figures, dolls, games, and puzzles', '1004 Play St', 'Louisville', 'KY', '40204', 38.245, -85.715, '2025-10-12', '09:00:00', '2025-10-12', '17:00:00', 'published', NOW()),

-- Clothing category
('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Category Test - Clothing Sale', 'Designer clothes, shoes, and accessories', '1005 Fashion Ave', 'Louisville', 'KY', '40204', 38.238, -85.720, '2025-10-13', '10:00:00', '2025-10-13', '18:00:00', 'published', NOW()),

-- Books category
('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Category Test - Books Sale', 'Novels, textbooks, magazines, and comics', '1006 Library Ln', 'Louisville', 'KY', '40204', 38.242, -85.712, '2025-10-13', '11:00:00', '2025-10-13', '19:00:00', 'published', NOW()),

-- Games category
('a0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Category Test - Games Sale', 'Board games, video games, and puzzles', '1007 Game St', 'Louisville', 'KY', '40204', 38.232, -85.718, '2025-10-14', '12:00:00', '2025-10-14', '20:00:00', 'published', NOW()),

-- Decor category
('a0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Category Test - Decor Sale', 'Artwork, vases, lamps, and home decor', '1008 Art Ave', 'Louisville', 'KY', '40204', 38.248, -85.708, '2025-10-14', '13:00:00', '2025-10-14', '21:00:00', 'published', NOW()),

-- Garden category
('a0000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Category Test - Garden Sale', 'Plants, tools, pots, and outdoor items', '1009 Garden Way', 'Louisville', 'KY', '40204', 38.225, -85.725, '2025-10-15', '14:00:00', '2025-10-15', '22:00:00', 'published', NOW()),

-- Kitchen category
('a0000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'Category Test - Kitchen Sale', 'Cookware, appliances, and kitchen gadgets', '1010 Cook St', 'Louisville', 'KY', '40204', 38.250, -85.700, '2025-10-15', '15:00:00', '2025-10-15', '23:00:00', 'published', NOW()),

-- Sports category
('a0000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'Category Test - Sports Sale', 'Exercise equipment, sports gear, and fitness items', '1011 Sport Ave', 'Louisville', 'KY', '40204', 38.220, -85.730, '2025-10-16', '16:00:00', '2025-10-16', '24:00:00', 'published', NOW()),

-- Vintage category
('a0000000-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'Category Test - Vintage Sale', 'Antiques, collectibles, and vintage items', '1012 Vintage Rd', 'Louisville', 'KY', '40204', 38.255, -85.695, '2025-10-16', '17:00:00', '2025-10-17', '01:00:00', 'published', NOW()),

-- Music category
('a0000000-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'Category Test - Music Sale', 'Instruments, records, CDs, and music equipment', '1013 Music St', 'Louisville', 'KY', '40204', 38.215, -85.740, '2025-10-17', '18:00:00', '2025-10-17', '02:00:00', 'published', NOW()),

-- Home category
('a0000000-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'Category Test - Home Sale', 'General household items and home goods', '1014 Home Ave', 'Louisville', 'KY', '40204', 38.260, -85.690, '2025-10-17', '19:00:00', '2025-10-17', '03:00:00', 'published', NOW()),

-- General category
('a0000000-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'Category Test - General Sale', 'Mixed items and miscellaneous goods', '1015 General St', 'Louisville', 'KY', '40204', 38.210, -85.750, '2025-10-18', '20:00:00', '2025-10-18', '04:00:00', 'published', NOW());

-- Now create items for each sale with the appropriate category
INSERT INTO lootaura_v2.items (sale_id, name, description, price, category) VALUES 
-- Furniture items
('a0000000-0000-0000-0000-000000000001', 'Leather Sofa', 'Brown leather 3-seat sofa, excellent condition', 299.99, 'furniture'),
('a0000000-0000-0000-0000-000000000001', 'Dining Table', 'Oak dining table with 6 chairs', 199.99, 'furniture'),
('a0000000-0000-0000-0000-000000000001', 'Bed Frame', 'Queen size wooden bed frame', 149.99, 'furniture'),

-- Electronics items
('a0000000-0000-0000-0000-000000000002', 'Samsung TV', '55" 4K Smart TV, like new', 599.99, 'electronics'),
('a0000000-0000-0000-0000-000000000002', 'MacBook Pro', '2019 MacBook Pro 13", 256GB', 899.99, 'electronics'),
('a0000000-0000-0000-0000-000000000002', 'iPhone 12', 'Unlocked iPhone 12, 128GB', 399.99, 'electronics'),

-- Tools items
('a0000000-0000-0000-0000-000000000003', 'Drill Set', 'Cordless drill with 20 bits', 79.99, 'tools'),
('a0000000-0000-0000-0000-000000000003', 'Toolbox', 'Professional toolbox with tools', 129.99, 'tools'),
('a0000000-0000-0000-0000-000000000003', 'Circular Saw', 'Electric circular saw', 89.99, 'tools'),

-- Toys items
('a0000000-0000-0000-0000-000000000004', 'LEGO Set', 'Star Wars LEGO set, complete', 49.99, 'toys'),
('a0000000-0000-0000-0000-000000000004', 'Action Figures', 'Collection of action figures', 29.99, 'toys'),
('a0000000-0000-0000-0000-000000000004', 'Board Games', 'Monopoly, Scrabble, and more', 39.99, 'toys'),

-- Clothing items
('a0000000-0000-0000-0000-000000000005', 'Designer Dress', 'Vintage designer dress, size M', 89.99, 'clothing'),
('a0000000-0000-0000-0000-000000000005', 'Nike Shoes', 'Nike Air Max, size 10', 59.99, 'clothing'),
('a0000000-0000-0000-0000-000000000005', 'Leather Jacket', 'Brown leather jacket, size L', 119.99, 'clothing'),

-- Books items
('a0000000-0000-0000-0000-000000000006', 'Book Collection', 'Classic novels and textbooks', 29.99, 'books'),
('a0000000-0000-0000-0000-000000000006', 'Magazines', 'National Geographic collection', 19.99, 'books'),
('a0000000-0000-0000-0000-000000000006', 'Cookbooks', 'Professional cookbook set', 39.99, 'books'),

-- Games items
('a0000000-0000-0000-0000-000000000007', 'Video Games', 'PS4 and Xbox games collection', 49.99, 'games'),
('a0000000-0000-0000-0000-000000000007', 'Board Games', 'Settlers of Catan, Risk, and more', 59.99, 'games'),
('a0000000-0000-0000-0000-000000000007', 'Puzzle Games', '1000-piece jigsaw puzzles', 19.99, 'games'),

-- Decor items
('a0000000-0000-0000-0000-000000000008', 'Artwork', 'Original paintings and prints', 79.99, 'decor'),
('a0000000-0000-0000-0000-000000000008', 'Vases', 'Ceramic and glass vases', 29.99, 'decor'),
('a0000000-0000-0000-0000-000000000008', 'Lamps', 'Table and floor lamps', 49.99, 'decor'),

-- Garden items
('a0000000-0000-0000-0000-000000000009', 'Garden Tools', 'Shovels, rakes, and pruners', 39.99, 'garden'),
('a0000000-0000-0000-0000-000000000009', 'Plant Pots', 'Various sizes ceramic pots', 19.99, 'garden'),
('a0000000-0000-0000-0000-000000000009', 'Seeds', 'Flower and vegetable seeds', 9.99, 'garden'),

-- Kitchen items
('a0000000-0000-0000-0000-000000000010', 'Cookware Set', 'Stainless steel cookware', 99.99, 'kitchen'),
('a0000000-0000-0000-0000-000000000010', 'Kitchen Appliances', 'Blender, toaster, coffee maker', 79.99, 'kitchen'),
('a0000000-0000-0000-0000-000000000010', 'Dinnerware', 'Complete dinnerware set', 59.99, 'kitchen'),

-- Sports items
('a0000000-0000-0000-0000-000000000011', 'Exercise Bike', 'Stationary exercise bike', 199.99, 'sports'),
('a0000000-0000-0000-0000-000000000011', 'Tennis Rackets', 'Professional tennis rackets', 89.99, 'sports'),
('a0000000-0000-0000-0000-000000000011', 'Golf Clubs', 'Complete golf club set', 299.99, 'sports'),

-- Vintage items
('a0000000-0000-0000-0000-000000000012', 'Antique Clock', 'Vintage grandfather clock', 399.99, 'vintage'),
('a0000000-0000-0000-0000-000000000012', 'Collectible Coins', 'Rare coin collection', 199.99, 'vintage'),
('a0000000-0000-0000-0000-000000000012', 'Vintage Jewelry', 'Antique rings and necklaces', 149.99, 'vintage'),

-- Music items
('a0000000-0000-0000-0000-000000000013', 'Guitar', 'Acoustic guitar with case', 199.99, 'music'),
('a0000000-0000-0000-0000-000000000013', 'Record Collection', 'Vinyl records from 60s-80s', 79.99, 'music'),
('a0000000-0000-0000-0000-000000000013', 'Piano', 'Upright piano, needs tuning', 299.99, 'music'),

-- Home items
('a0000000-0000-0000-0000-000000000014', 'Home Decor', 'Various home decoration items', 49.99, 'home'),
('a0000000-0000-0000-0000-000000000014', 'Cleaning Supplies', 'Household cleaning products', 29.99, 'home'),
('a0000000-0000-0000-0000-000000000014', 'Storage Boxes', 'Plastic storage containers', 19.99, 'home'),

-- General items
('a0000000-0000-0000-0000-000000000015', 'Miscellaneous Items', 'Various household items', 29.99, 'general'),
('a0000000-0000-0000-0000-000000000015', 'Mixed Collection', 'Assorted goods and items', 39.99, 'general'),
('a0000000-0000-0000-0000-000000000015', 'Random Items', 'Various random household items', 19.99, 'general');

-- Update address_key for all new test sales
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE title LIKE 'Category Test%';

-- Verify category coverage
SELECT 
    i.category,
    COUNT(DISTINCT s.id) as sale_count,
    COUNT(i.id) as item_count
FROM lootaura_v2.sales s
JOIN lootaura_v2.items i ON s.id = i.sale_id
WHERE s.title LIKE 'Category Test%' 
GROUP BY i.category 
ORDER BY i.category;

-- Show total test sales count
SELECT COUNT(*) as total_category_test_sales FROM lootaura_v2.sales WHERE title LIKE 'Category Test%';
