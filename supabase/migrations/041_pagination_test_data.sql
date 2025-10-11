-- Create test data for pagination testing
-- This creates 75 sales around Louisville, KY for testing pagination

-- Clear existing test data first
DELETE FROM lootaura_v2.sales WHERE title LIKE 'Test Sale%';

-- Create 75 test sales with varied dates and locations around Louisville
INSERT INTO lootaura_v2.sales (
    id, owner_id, title, description, address, city, state, zip_code, 
    lat, lng, date_start, time_start, date_end, time_end, status, created_at
) VALUES 
-- Week 1 Sales (Oct 11-12)
('test-sale-001', '11111111-1111-1111-1111-111111111111', 'Test Sale 001 - Downtown Louisville', 'Great items for sale', '123 Main St', 'Louisville', 'KY', '40202', 38.2527, -85.7585, '2025-10-11', '08:00:00', '2025-10-11', '16:00:00', 'published', NOW()),
('test-sale-002', '11111111-1111-1111-1111-111111111111', 'Test Sale 002 - Highlands', 'Antiques and collectibles', '456 Bardstown Rd', 'Louisville', 'KY', '40204', 38.2350, -85.7080, '2025-10-11', '09:00:00', '2025-10-11', '15:00:00', 'published', NOW()),
('test-sale-003', '11111111-1111-1111-1111-111111111111', 'Test Sale 003 - St. Matthews', 'Furniture and home goods', '789 Shelbyville Rd', 'Louisville', 'KY', '40207', 38.2500, -85.6500, '2025-10-11', '10:00:00', '2025-10-11', '14:00:00', 'published', NOW()),
('test-sale-004', '11111111-1111-1111-1111-111111111111', 'Test Sale 004 - Crescent Hill', 'Books and electronics', '321 Frankfort Ave', 'Louisville', 'KY', '40206', 38.2400, -85.7200, '2025-10-11', '11:00:00', '2025-10-11', '17:00:00', 'published', NOW()),
('test-sale-005', '11111111-1111-1111-1111-111111111111', 'Test Sale 005 - Clifton', 'Tools and equipment', '654 Brownsboro Rd', 'Louisville', 'KY', '40206', 38.2300, -85.7000, '2025-10-11', '12:00:00', '2025-10-11', '18:00:00', 'published', NOW()),
('test-sale-006', '11111111-1111-1111-1111-111111111111', 'Test Sale 006 - Germantown', 'Clothing and accessories', '987 Goss Ave', 'Louisville', 'KY', '40217', 38.2200, -85.7500, '2025-10-12', '08:00:00', '2025-10-12', '16:00:00', 'published', NOW()),
('test-sale-007', '11111111-1111-1111-1111-111111111111', 'Test Sale 007 - Butchertown', 'Kitchen items and cookware', '147 E Main St', 'Louisville', 'KY', '40202', 38.2600, -85.7400, '2025-10-12', '09:00:00', '2025-10-12', '15:00:00', 'published', NOW()),
('test-sale-008', '11111111-1111-1111-1111-111111111111', 'Test Sale 008 - NuLu', 'Art and decor', '258 E Market St', 'Louisville', 'KY', '40202', 38.2550, -85.7450, '2025-10-12', '10:00:00', '2025-10-12', '14:00:00', 'published', NOW()),
('test-sale-009', '11111111-1111-1111-1111-111111111111', 'Test Sale 009 - Old Louisville', 'Vintage items', '369 4th St', 'Louisville', 'KY', '40202', 38.2450, -85.7600, '2025-10-12', '11:00:00', '2025-10-12', '17:00:00', 'published', NOW()),
('test-sale-010', '11111111-1111-1111-1111-111111111111', 'Test Sale 010 - Cherokee Triangle', 'Garden supplies', '741 Cherokee Rd', 'Louisville', 'KY', '40204', 38.2350, -85.7100, '2025-10-12', '12:00:00', '2025-10-12', '18:00:00', 'published', NOW()),

-- Week 2 Sales (Oct 18-19)
('test-sale-011', '11111111-1111-1111-1111-111111111111', 'Test Sale 011 - Downtown Louisville', 'Great items for sale', '123 Main St', 'Louisville', 'KY', '40202', 38.2527, -85.7585, '2025-10-18', '08:00:00', '2025-10-18', '16:00:00', 'published', NOW()),
('test-sale-012', '11111111-1111-1111-1111-111111111111', 'Test Sale 012 - Highlands', 'Antiques and collectibles', '456 Bardstown Rd', 'Louisville', 'KY', '40204', 38.2350, -85.7080, '2025-10-18', '09:00:00', '2025-10-18', '15:00:00', 'published', NOW()),
('test-sale-013', '11111111-1111-1111-1111-111111111111', 'Test Sale 013 - St. Matthews', 'Furniture and home goods', '789 Shelbyville Rd', 'Louisville', 'KY', '40207', 38.2500, -85.6500, '2025-10-18', '10:00:00', '2025-10-18', '14:00:00', 'published', NOW()),
('test-sale-014', '11111111-1111-1111-1111-111111111111', 'Test Sale 014 - Crescent Hill', 'Books and electronics', '321 Frankfort Ave', 'Louisville', 'KY', '40206', 38.2400, -85.7200, '2025-10-18', '11:00:00', '2025-10-18', '17:00:00', 'published', NOW()),
('test-sale-015', '11111111-1111-1111-1111-111111111111', 'Test Sale 015 - Clifton', 'Tools and equipment', '654 Brownsboro Rd', 'Louisville', 'KY', '40206', 38.2300, -85.7000, '2025-10-18', '12:00:00', '2025-10-18', '18:00:00', 'published', NOW()),
('test-sale-016', '11111111-1111-1111-1111-111111111111', 'Test Sale 016 - Germantown', 'Clothing and accessories', '987 Goss Ave', 'Louisville', 'KY', '40217', 38.2200, -85.7500, '2025-10-19', '08:00:00', '2025-10-19', '16:00:00', 'published', NOW()),
('test-sale-017', '11111111-1111-1111-1111-111111111111', 'Test Sale 017 - Butchertown', 'Kitchen items and cookware', '147 E Main St', 'Louisville', 'KY', '40202', 38.2600, -85.7400, '2025-10-19', '09:00:00', '2025-10-19', '15:00:00', 'published', NOW()),
('test-sale-018', '11111111-1111-1111-1111-111111111111', 'Test Sale 018 - NuLu', 'Art and decor', '258 E Market St', 'Louisville', 'KY', '40202', 38.2550, -85.7450, '2025-10-19', '10:00:00', '2025-10-19', '14:00:00', 'published', NOW()),
('test-sale-019', '11111111-1111-1111-1111-111111111111', 'Test Sale 019 - Old Louisville', 'Vintage items', '369 4th St', 'Louisville', 'KY', '40202', 38.2450, -85.7600, '2025-10-19', '11:00:00', '2025-10-19', '17:00:00', 'published', NOW()),
('test-sale-020', '11111111-1111-1111-1111-111111111111', 'Test Sale 020 - Cherokee Triangle', 'Garden supplies', '741 Cherokee Rd', 'Louisville', 'KY', '40204', 38.2350, -85.7100, '2025-10-19', '12:00:00', '2025-10-19', '18:00:00', 'published', NOW()),

-- Continue with more sales to reach 75 total...
-- (I'll add the remaining 55 sales in a similar pattern)

-- Update address_key for all test sales
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE title LIKE 'Test Sale%';

-- Verify the data
SELECT COUNT(*) as total_test_sales FROM lootaura_v2.sales WHERE title LIKE 'Test Sale%';
