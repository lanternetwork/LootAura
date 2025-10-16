-- Add categories to existing test sales for category filtering testing
-- This ensures we have at least one sale with each category

-- First, let's see what test sales we have
SELECT COUNT(*) as total_test_sales FROM lootaura_v2.sales WHERE title LIKE 'Test Sale%';

-- Add categories to test sales based on their titles/descriptions
-- We'll assign categories systematically to ensure coverage

-- Update test sales with specific categories
UPDATE lootaura_v2.sales 
SET category = CASE 
    -- Furniture sales
    WHEN title LIKE '%Furniture%' OR description LIKE '%furniture%' THEN 'furniture'
    WHEN title LIKE '%Estate%' OR description LIKE '%antiques%' THEN 'vintage'
    WHEN title LIKE '%Moving%' OR description LIKE '%household%' THEN 'home'
    
    -- Electronics sales  
    WHEN title LIKE '%Electronics%' OR description LIKE '%electronics%' THEN 'electronics'
    WHEN title LIKE '%Vintage%' OR description LIKE '%records%' THEN 'music'
    
    -- Tools and equipment
    WHEN title LIKE '%Tools%' OR description LIKE '%tools%' THEN 'tools'
    WHEN title LIKE '%Garage%' OR description LIKE '%equipment%' THEN 'tools'
    
    -- Kids and toys
    WHEN title LIKE '%Kids%' OR description LIKE '%toys%' THEN 'toys'
    WHEN title LIKE '%Neighborhood%' OR description LIKE '%clothing%' THEN 'clothing'
    
    -- Kitchen and home
    WHEN title LIKE '%Kitchen%' OR description LIKE '%cookware%' THEN 'kitchen'
    WHEN title LIKE '%Community%' OR description LIKE '%items%' THEN 'home'
    
    -- Sports and outdoor
    WHEN title LIKE '%Sports%' OR description LIKE '%fitness%' THEN 'sports'
    WHEN title LIKE '%Garden%' OR description LIKE '%outdoor%' THEN 'garden'
    
    -- Books and games
    WHEN title LIKE '%Books%' OR description LIKE '%books%' THEN 'books'
    WHEN title LIKE '%Games%' OR description LIKE '%games%' THEN 'games'
    
    -- Art and decor
    WHEN title LIKE '%Art%' OR description LIKE '%art%' THEN 'decor'
    WHEN title LIKE '%Decor%' OR description LIKE '%collectibles%' THEN 'decor'
    
    -- Default fallback
    ELSE 'general'
END
WHERE title LIKE 'Test Sale%' AND category IS NULL;

-- For sales that still don't have categories, assign them systematically
-- to ensure we have at least one sale per category

-- Assign remaining sales to categories in a round-robin fashion
WITH numbered_sales AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
    FROM lootaura_v2.sales 
    WHERE title LIKE 'Test Sale%' AND (category IS NULL OR category = '')
),
category_list AS (
    SELECT unnest(ARRAY[
        'furniture', 'electronics', 'tools', 'toys', 'clothing', 
        'books', 'games', 'decor', 'garden', 'kitchen', 'sports', 
        'vintage', 'music', 'home', 'general'
    ]) as cat
)
UPDATE lootaura_v2.sales 
SET category = cl.cat
FROM numbered_sales ns, category_list cl
WHERE lootaura_v2.sales.id = ns.id 
AND cl.cat = (
    SELECT cat FROM category_list 
    ORDER BY cat 
    LIMIT 1 OFFSET (ns.rn - 1) % 15
);

-- Verify we have sales with each category
SELECT 
    category,
    COUNT(*) as count
FROM lootaura_v2.sales 
WHERE title LIKE 'Test Sale%' 
GROUP BY category 
ORDER BY category;

-- Show sample sales with their categories
SELECT 
    title,
    description,
    category,
    city,
    state
FROM lootaura_v2.sales 
WHERE title LIKE 'Test Sale%' 
ORDER BY category, title
LIMIT 20;
