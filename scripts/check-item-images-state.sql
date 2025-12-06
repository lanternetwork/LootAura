-- Diagnostic: Check current state of item image fields in lootaura_v2.items
-- Returns results as a query result set for visibility in Supabase SQL editor

SELECT 
  'Total items' AS metric,
  COUNT(*)::INTEGER AS count
FROM lootaura_v2.items

UNION ALL

SELECT 
  'Items with image_url populated' AS metric,
  COUNT(*)::INTEGER AS count
FROM lootaura_v2.items 
WHERE image_url IS NOT NULL AND image_url != ''

UNION ALL

SELECT 
  'Items with images array populated' AS metric,
  COUNT(*)::INTEGER AS count
FROM lootaura_v2.items 
WHERE images IS NOT NULL 
  AND array_length(images, 1) IS NOT NULL 
  AND array_length(images, 1) > 0

UNION ALL

SELECT 
  'Items needing backfill (image_url but no images)' AS metric,
  COUNT(*)::INTEGER AS count
FROM lootaura_v2.items 
WHERE (images IS NULL OR array_length(images, 1) IS NULL OR array_length(images, 1) = 0)
  AND image_url IS NOT NULL 
  AND image_url != ''

UNION ALL

SELECT 
  'Items with both image_url and images' AS metric,
  COUNT(*)::INTEGER AS count
FROM lootaura_v2.items 
WHERE image_url IS NOT NULL 
  AND image_url != ''
  AND images IS NOT NULL 
  AND array_length(images, 1) IS NOT NULL 
  AND array_length(images, 1) > 0

UNION ALL

SELECT 
  'Items with neither image_url nor images' AS metric,
  COUNT(*)::INTEGER AS count
FROM lootaura_v2.items 
WHERE (image_url IS NULL OR image_url = '')
  AND (images IS NULL OR array_length(images, 1) IS NULL OR array_length(images, 1) = 0)

ORDER BY metric;
