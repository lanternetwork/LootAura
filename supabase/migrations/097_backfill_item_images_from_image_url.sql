-- Migration 097: Backfill item images array from image_url
-- 
-- Purpose: Populate the `images` array field for items that have `image_url` but no `images`.
-- This ensures the base table is authoritative and both fields are consistent.
--
-- Canonical model:
-- - `images` (TEXT[]) is the primary field - array of image URLs
-- - `image_url` (TEXT) is kept for backward compatibility and should equal `images[0]` when images exist
--
-- This migration is idempotent and safe to run multiple times.

-- Backfill: For items with image_url but no images, set images = ARRAY[image_url]
UPDATE lootaura_v2.items
SET 
  images = ARRAY[image_url]::TEXT[]
WHERE 
  image_url IS NOT NULL 
  AND image_url != ''
  AND (images IS NULL OR array_length(images, 1) IS NULL OR array_length(images, 1) = 0);

-- Verify backfill results
DO $$
DECLARE
  backfilled_count INTEGER;
  total_with_images INTEGER;
  total_with_image_url INTEGER;
  inconsistent_count INTEGER;
BEGIN
  -- Count items that were backfilled
  SELECT COUNT(*) INTO backfilled_count
  FROM lootaura_v2.items
  WHERE image_url IS NOT NULL 
    AND image_url != ''
    AND images IS NOT NULL 
    AND array_length(images, 1) > 0
    AND images[1] = image_url;
  
  -- Count total items with images
  SELECT COUNT(*) INTO total_with_images
  FROM lootaura_v2.items
  WHERE images IS NOT NULL AND array_length(images, 1) > 0;
  
  -- Count total items with image_url
  SELECT COUNT(*) INTO total_with_image_url
  FROM lootaura_v2.items
  WHERE image_url IS NOT NULL AND image_url != '';
  
  -- Count items where image_url doesn't match images[0] (should be 0 after backfill)
  SELECT COUNT(*) INTO inconsistent_count
  FROM lootaura_v2.items
  WHERE image_url IS NOT NULL 
    AND image_url != ''
    AND images IS NOT NULL 
    AND array_length(images, 1) > 0
    AND images[1] != image_url;
  
  RAISE NOTICE 'Backfill complete. Items with images array: %, Items with image_url: %, Inconsistent (image_url != images[0]): %', 
    total_with_images, total_with_image_url, inconsistent_count;
  
  IF inconsistent_count > 0 THEN
    RAISE WARNING 'Found % items where image_url does not match images[0]. These should be reviewed.', inconsistent_count;
  END IF;
END $$;

