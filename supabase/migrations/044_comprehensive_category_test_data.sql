-- Create comprehensive test data with guaranteed category coverage
-- This ensures we have at least one sale for each category in Louisville area

-- Clear any existing comprehensive test data
DELETE FROM lootaura_v2.sales WHERE title LIKE 'Category Test%';

-- Create test sales with specific categories
INSERT INTO lootaura_v2.sales (
    id, owner_id, title, description, address, city, state, zip_code, 
    lat, lng, date_start, time_start, date_end, time_end, status, category, created_at
) VALUES 
-- Furniture category
('cat-test-001', '11111111-1111-1111-1111-111111111111', 'Category Test - Furniture Sale', 'Sofas, tables, chairs, and bedroom sets', '1001 Furniture Ave', 'Louisville', 'KY', '40204', 38.235, -85.708, '2025-10-11', '09:00:00', '2025-10-11', '17:00:00', 'published', 'furniture', NOW()),

-- Electronics category  
('cat-test-002', '11111111-1111-1111-1111-111111111111', 'Category Test - Electronics Sale', 'TVs, computers, phones, and gadgets', '1002 Tech St', 'Louisville', 'KY', '40204', 38.240, -85.710, '2025-10-11', '10:00:00', '2025-10-11', '18:00:00', 'published', 'electronics', NOW()),

-- Tools category
('cat-test-003', '11111111-1111-1111-1111-111111111111', 'Category Test - Tools Sale', 'Power tools, hand tools, and workshop equipment', '1003 Workshop Rd', 'Louisville', 'KY', '40204', 38.230, -85.705, '2025-10-12', '08:00:00', '2025-10-12', '16:00:00', 'published', 'tools', NOW()),

-- Toys category
('cat-test-004', '11111111-1111-1111-1111-111111111111', 'Category Test - Toys Sale', 'Action figures, dolls, games, and puzzles', '1004 Play St', 'Louisville', 'KY', '40204', 38.245, -85.715, '2025-10-12', '09:00:00', '2025-10-12', '17:00:00', 'published', 'toys', NOW()),

-- Clothing category
('cat-test-005', '11111111-1111-1111-1111-111111111111', 'Category Test - Clothing Sale', 'Designer clothes, shoes, and accessories', '1005 Fashion Ave', 'Louisville', 'KY', '40204', 38.238, -85.720, '2025-10-13', '10:00:00', '2025-10-13', '18:00:00', 'published', 'clothing', NOW()),

-- Books category
('cat-test-006', '11111111-1111-1111-1111-111111111111', 'Category Test - Books Sale', 'Novels, textbooks, magazines, and comics', '1006 Library Ln', 'Louisville', 'KY', '40204', 38.242, -85.712, '2025-10-13', '11:00:00', '2025-10-13', '19:00:00', 'published', 'books', NOW()),

-- Games category
('cat-test-007', '11111111-1111-1111-1111-111111111111', 'Category Test - Games Sale', 'Board games, video games, and puzzles', '1007 Game St', 'Louisville', 'KY', '40204', 38.232, -85.718, '2025-10-14', '12:00:00', '2025-10-14', '20:00:00', 'published', 'games', NOW()),

-- Decor category
('cat-test-008', '11111111-1111-1111-1111-111111111111', 'Category Test - Decor Sale', 'Artwork, vases, lamps, and home decor', '1008 Art Ave', 'Louisville', 'KY', '40204', 38.248, -85.708, '2025-10-14', '13:00:00', '2025-10-14', '21:00:00', 'published', 'decor', NOW()),

-- Garden category
('cat-test-009', '11111111-1111-1111-1111-111111111111', 'Category Test - Garden Sale', 'Plants, tools, pots, and outdoor items', '1009 Garden Way', 'Louisville', 'KY', '40204', 38.225, -85.725, '2025-10-15', '14:00:00', '2025-10-15', '22:00:00', 'published', 'garden', NOW()),

-- Kitchen category
('cat-test-010', '11111111-1111-1111-1111-111111111111', 'Category Test - Kitchen Sale', 'Cookware, appliances, and kitchen gadgets', '1010 Cook St', 'Louisville', 'KY', '40204', 38.250, -85.700, '2025-10-15', '15:00:00', '2025-10-15', '23:00:00', 'published', 'kitchen', NOW()),

-- Sports category
('cat-test-011', '11111111-1111-1111-1111-111111111111', 'Category Test - Sports Sale', 'Exercise equipment, sports gear, and fitness items', '1011 Sport Ave', 'Louisville', 'KY', '40204', 38.220, -85.730, '2025-10-16', '16:00:00', '2025-10-16', '24:00:00', 'published', 'sports', NOW()),

-- Vintage category
('cat-test-012', '11111111-1111-1111-1111-111111111111', 'Category Test - Vintage Sale', 'Antiques, collectibles, and vintage items', '1012 Vintage Rd', 'Louisville', 'KY', '40204', 38.255, -85.695, '2025-10-16', '17:00:00', '2025-10-17', '01:00:00', 'published', 'vintage', NOW()),

-- Music category
('cat-test-013', '11111111-1111-1111-1111-111111111111', 'Category Test - Music Sale', 'Instruments, records, CDs, and music equipment', '1013 Music St', 'Louisville', 'KY', '40204', 38.215, -85.740, '2025-10-17', '18:00:00', '2025-10-17', '02:00:00', 'published', 'music', NOW()),

-- Home category
('cat-test-014', '11111111-1111-1111-1111-111111111111', 'Category Test - Home Sale', 'General household items and home goods', '1014 Home Ave', 'Louisville', 'KY', '40204', 38.260, -85.690, '2025-10-17', '19:00:00', '2025-10-17', '03:00:00', 'published', 'home', NOW()),

-- General category
('cat-test-015', '11111111-1111-1111-1111-111111111111', 'Category Test - General Sale', 'Mixed items and miscellaneous goods', '1015 General St', 'Louisville', 'KY', '40204', 38.210, -85.750, '2025-10-18', '20:00:00', '2025-10-18', '04:00:00', 'published', 'general', NOW());

-- Update address_key for all new test sales
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE title LIKE 'Category Test%';

-- Verify category coverage
SELECT 
    category,
    COUNT(*) as count,
    STRING_AGG(title, ', ') as sample_titles
FROM lootaura_v2.sales 
WHERE title LIKE 'Category Test%' 
GROUP BY category 
ORDER BY category;

-- Show total test sales count
SELECT COUNT(*) as total_category_test_sales FROM lootaura_v2.sales WHERE title LIKE 'Category Test%';
