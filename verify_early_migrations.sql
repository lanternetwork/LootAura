-- Verify key early migrations (001-102) have been applied
-- This checks for core structural elements that indicate migrations are in place

SELECT 
  'Core Schema: lootaura_v2 schema exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.schemata 
      WHERE schema_name = 'lootaura_v2'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Core schema not found'
  END AS status
UNION ALL
SELECT 
  'Core Tables: sales table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Sales table not found'
  END AS status
UNION ALL
SELECT 
  'Core Tables: profiles table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'profiles'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Profiles table not found'
  END AS status
UNION ALL
SELECT 
  'Core Tables: items table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'items'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Items table not found'
  END AS status
UNION ALL
SELECT 
  'PostGIS: geom column in sales table' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'geom'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - PostGIS migration not applied'
  END AS status
UNION ALL
SELECT 
  'Views: sales_v2 view exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'sales_v2'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - sales_v2 view not found'
  END AS status
UNION ALL
SELECT 
  'Views: profiles_v2 view exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'profiles_v2'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - profiles_v2 view not found'
  END AS status
UNION ALL
SELECT 
  'Views: favorites_v2 view exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'favorites_v2'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - favorites_v2 view not found'
  END AS status
UNION ALL
SELECT 
  'Tables: favorites table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'favorites'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Favorites table not found'
  END AS status
UNION ALL
SELECT 
  'Tables: sale_drafts table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sale_drafts'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Sale drafts table not found'
  END AS status
UNION ALL
SELECT 
  'Tables: analytics_events table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'analytics_events'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Analytics events table not found'
  END AS status
UNION ALL
SELECT 
  'Tables: seller_ratings table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'seller_ratings'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Seller ratings table not found'
  END AS status
UNION ALL
SELECT 
  'Tables: owner_stats table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'owner_stats'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Owner stats table not found'
  END AS status
UNION ALL
SELECT 
  'Tables: zipcodes table exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'zipcodes'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Zipcodes table not found'
  END AS status
UNION ALL
SELECT 
  'Sales Columns: cover_image_url exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'cover_image_url'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Migration 052 not applied'
  END AS status
UNION ALL
SELECT 
  'Sales Columns: pricing_mode exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'pricing_mode'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Migration 055 not applied'
  END AS status
UNION ALL
SELECT 
  'Sales Columns: privacy_mode exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'privacy_mode'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Privacy mode column not found'
  END AS status
UNION ALL
SELECT 
  'Sales Columns: tags column exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'sales' 
      AND column_name = 'tags'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Tags column not found'
  END AS status
UNION ALL
SELECT 
  'Profiles Columns: social_links exists' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'profiles' 
      AND column_name = 'social_links'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Migration 084 not applied'
  END AS status
UNION ALL
SELECT 
  'Profiles Columns: notification preferences exist' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'lootaura_v2' 
      AND table_name = 'profiles' 
      AND column_name = 'email_favorites_digest_enabled'
    ) THEN '✓ APPLIED'
    ELSE '✗ MISSING - Migration 100 not applied'
  END AS status
ORDER BY check_name;




