-- Create test sales for current and upcoming weekends
-- This ensures we have sales showing up for "this weekend" and "next weekend" filters

-- Clear any existing weekend test data
DELETE FROM lootaura_v2.items WHERE sale_id IN (SELECT id FROM lootaura_v2.sales WHERE title LIKE 'Weekend Test%');
DELETE FROM lootaura_v2.sales WHERE title LIKE 'Weekend Test%';

-- Get current date for reference
-- Current weekend: January 18-19, 2025 (Saturday-Sunday)
-- Next weekend: January 25-26, 2025 (Saturday-Sunday)

-- Create sales for THIS weekend (January 18-19, 2025)
INSERT INTO lootaura_v2.sales (
    id, owner_id, title, description, address, city, state, zip_code, 
    lat, lng, date_start, time_start, date_end, time_end, status, created_at
) VALUES 
-- Saturday, January 18, 2025
('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Saturday Morning Sale', 'Early bird furniture and electronics', '2001 Saturday St', 'Louisville', 'KY', '40204', 38.235, -85.708, '2025-01-18', '08:00:00', '2025-01-18', '12:00:00', 'published', NOW()),
('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Saturday Afternoon Sale', 'Tools, toys, and household items', '2002 Saturday Ave', 'Louisville', 'KY', '40204', 38.240, -85.710, '2025-01-18', '13:00:00', '2025-01-18', '17:00:00', 'published', NOW()),
('b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Saturday Evening Sale', 'Books, games, and collectibles', '2003 Saturday Rd', 'Louisville', 'KY', '40204', 38.230, -85.705, '2025-01-18', '18:00:00', '2025-01-18', '21:00:00', 'published', NOW()),

-- Sunday, January 19, 2025
('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Sunday Morning Sale', 'Clothing, shoes, and accessories', '2004 Sunday St', 'Louisville', 'KY', '40204', 38.245, -85.715, '2025-01-19', '09:00:00', '2025-01-19', '13:00:00', 'published', NOW()),
('b0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Sunday Afternoon Sale', 'Kitchen items, decor, and home goods', '2005 Sunday Ave', 'Louisville', 'KY', '40204', 38.238, -85.720, '2025-01-19', '14:00:00', '2025-01-19', '18:00:00', 'published', NOW()),

-- NEXT weekend (January 25-26, 2025)
('b0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Next Saturday Sale', 'Sports equipment and outdoor gear', '2006 Next Saturday St', 'Louisville', 'KY', '40204', 38.242, -85.712, '2025-01-25', '10:00:00', '2025-01-25', '16:00:00', 'published', NOW()),
('b0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Next Sunday Sale', 'Vintage items and antiques', '2007 Next Sunday Ave', 'Louisville', 'KY', '40204', 38.232, -85.718, '2025-01-26', '11:00:00', '2025-01-26', '17:00:00', 'published', NOW()),

-- Mixed weekend sales with various categories
('b0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Multi-Category Sale', 'Furniture, electronics, and more', '2008 Multi St', 'Louisville', 'KY', '40204', 38.248, -85.708, '2025-01-18', '10:00:00', '2025-01-19', '16:00:00', 'published', NOW()),
('b0000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Weekend Test - Next Multi-Category Sale', 'Tools, toys, books, and games', '2009 Next Multi Ave', 'Louisville', 'KY', '40204', 38.225, -85.725, '2025-01-25', '09:00:00', '2025-01-26', '15:00:00', 'published', NOW());

-- Create items for each weekend sale with diverse categories
INSERT INTO lootaura_v2.items (sale_id, name, description, price, category) VALUES 
-- Saturday Morning Sale items
('b0000000-0000-0000-0000-000000000001', 'Coffee Table', 'Wooden coffee table with storage', 89.99, 'furniture'),
('b0000000-0000-0000-0000-000000000001', 'Laptop', 'Used laptop in good condition', 299.99, 'electronics'),
('b0000000-0000-0000-0000-000000000001', 'TV Stand', 'Modern TV stand with shelves', 129.99, 'furniture'),

-- Saturday Afternoon Sale items
('b0000000-0000-0000-0000-000000000002', 'Drill Set', 'Complete power drill set', 79.99, 'tools'),
('b0000000-0000-0000-0000-000000000002', 'Action Figures', 'Vintage action figure collection', 49.99, 'toys'),
('b0000000-0000-0000-0000-000000000002', 'Kitchen Gadgets', 'Various kitchen tools and gadgets', 29.99, 'kitchen'),

-- Saturday Evening Sale items
('b0000000-0000-0000-0000-000000000003', 'Book Collection', 'Mystery and thriller novels', 39.99, 'books'),
('b0000000-0000-0000-0000-000000000003', 'Board Games', 'Classic board game collection', 59.99, 'games'),
('b0000000-0000-0000-0000-000000000003', 'Vintage Records', 'Vinyl record collection', 89.99, 'music'),

-- Sunday Morning Sale items
('b0000000-0000-0000-0000-000000000004', 'Designer Dress', 'Vintage designer dress', 79.99, 'clothing'),
('b0000000-0000-0000-0000-000000000004', 'Shoe Collection', 'Various shoes in good condition', 39.99, 'clothing'),
('b0000000-0000-0000-0000-000000000004', 'Handbag', 'Designer handbag', 49.99, 'clothing'),

-- Sunday Afternoon Sale items
('b0000000-0000-0000-0000-000000000005', 'Dinnerware Set', 'Complete dinnerware set', 69.99, 'kitchen'),
('b0000000-0000-0000-0000-000000000005', 'Wall Art', 'Decorative wall art pieces', 29.99, 'decor'),
('b0000000-0000-0000-0000-000000000005', 'Lamp', 'Table lamp with shade', 39.99, 'decor'),

-- Next Saturday Sale items
('b0000000-0000-0000-0000-000000000006', 'Tennis Racket', 'Professional tennis racket', 89.99, 'sports'),
('b0000000-0000-0000-0000-000000000006', 'Exercise Bike', 'Stationary exercise bike', 199.99, 'sports'),
('b0000000-0000-0000-0000-000000000006', 'Garden Tools', 'Outdoor gardening tools', 49.99, 'garden'),

-- Next Sunday Sale items
('b0000000-0000-0000-0000-000000000007', 'Antique Clock', 'Vintage grandfather clock', 299.99, 'vintage'),
('b0000000-0000-0000-0000-000000000007', 'Collectible Coins', 'Rare coin collection', 199.99, 'vintage'),
('b0000000-0000-0000-0000-000000000007', 'Vintage Jewelry', 'Antique jewelry pieces', 149.99, 'vintage'),

-- Multi-Category Sale items (This weekend)
('b0000000-0000-0000-0000-000000000008', 'Sofa', 'Comfortable 3-seat sofa', 399.99, 'furniture'),
('b0000000-0000-0000-0000-000000000008', 'Smartphone', 'Latest model smartphone', 599.99, 'electronics'),
('b0000000-0000-0000-0000-000000000008', 'Gaming Console', 'Video game console with games', 299.99, 'games'),
('b0000000-0000-0000-0000-000000000008', 'Kitchen Appliances', 'Various kitchen appliances', 199.99, 'kitchen'),

-- Multi-Category Sale items (Next weekend)
('b0000000-0000-0000-0000-000000000009', 'Tool Set', 'Complete workshop tool set', 149.99, 'tools'),
('b0000000-0000-0000-0000-000000000009', 'Children\'s Toys', 'Assorted children\'s toys', 79.99, 'toys'),
('b0000000-0000-0000-0000-000000000009', 'Book Library', 'Extensive book collection', 99.99, 'books'),
('b0000000-0000-0000-0000-000000000009', 'Puzzle Collection', 'Jigsaw puzzles and brain teasers', 49.99, 'games');

-- Update address_key for all new weekend test sales
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE title LIKE 'Weekend Test%';

-- Verify weekend sales coverage
SELECT 
    s.title,
    s.date_start,
    s.time_start,
    s.time_end,
    COUNT(i.id) as item_count,
    STRING_AGG(DISTINCT i.category, ', ') as categories
FROM lootaura_v2.sales s
LEFT JOIN lootaura_v2.items i ON s.id = i.sale_id
WHERE s.title LIKE 'Weekend Test%' 
GROUP BY s.id, s.title, s.date_start, s.time_start, s.time_end
ORDER BY s.date_start, s.time_start;

-- Show total weekend test sales count
SELECT COUNT(*) as total_weekend_test_sales FROM lootaura_v2.sales WHERE title LIKE 'Weekend Test%';
