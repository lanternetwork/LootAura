# Item Image Normalization Audit & Fix

**Date**: 2025-12-05  
**Status**: ✅ Complete

## Summary

Performed end-to-end audit and fix of item image creation and read flow to make `lootaura_v2.items` the single source of truth for item images.

## Canonical Model

- **`images` (TEXT[])**: Primary field - array of image URLs. First element (`images[0]`) is the display image.
- **`image_url` (TEXT)**: Backward compatibility field - should equal `images[0]` when images exist.

All write paths now normalize to this format, ensuring consistency.

## Write Paths Fixed

### 1. `/api/items_v2` POST
- **File**: `app/api/items_v2/route.ts`
- **Fix**: Uses `normalizeItemImages()` helper to set both `images` and `image_url`
- **Status**: ✅ Fixed

### 2. `/api/items_v2` PUT
- **File**: `app/api/items_v2/route.ts`
- **Fix**: Normalizes image fields in update payload before writing
- **Status**: ✅ Fixed

### 3. `/api/items` POST (Legacy)
- **File**: `app/api/items/route.ts`
- **Fix**: Normalizes `image_url` input to both `images` array and `image_url`
- **Status**: ✅ Fixed

### 4. `/api/items` PUT (Legacy)
- **File**: `app/api/items/route.ts`
- **Fix**: Normalizes `image_url` input to both `images` array and `image_url`
- **Status**: ✅ Fixed

### 5. `createItem` Server Action
- **File**: `app/(sales)/_actions.ts`
- **Fix**: Uses base table write with normalized image fields
- **Status**: ✅ Fixed

### 6. Draft Publish
- **File**: `app/api/drafts/publish/route.ts`
- **Fix**: Normalizes item image fields when creating items from draft
- **Status**: ✅ Fixed

## Helper Function

**File**: `lib/data/itemImageNormalization.ts`

- `normalizeItemImages(input)`: Normalizes image input to canonical format
  - Accepts `image_url` (string) and/or `images` (array)
  - Returns both `images` (array) and `image_url` (string) for database writes
  - Handles empty strings, nulls, and type validation

## Backfill Migration

**File**: `supabase/migrations/097_backfill_item_images_from_image_url.sql`

- Populates `images` array for items that have `image_url` but no `images`
- Sets `images = ARRAY[image_url]` for affected rows
- Idempotent and safe to run multiple times
- Includes verification queries

## Read Path

**File**: `lib/data/salesAccess.ts` - `getSaleWithItems()`

- **Primary**: Reads from `lootaura_v2.items` base table
- **Fallback**: Falls back to `items_v2` view if base table has no images (TEMPORARY SAFETY NET)
- **Mapping**: Prefers `images[0]`, falls back to `image_url`
- **Documentation**: Added TODO comments to remove view fallback after 2-4 weeks of production stability

## View Fallback Strategy

The view fallback is kept as a **temporary safety net** during the transition period:

- Triggers when base table returns items but none have usable images
- Should be rare after migration 097 and normalized writes
- Documented with TODO to remove after confirming base-table images are authoritative (2-4 weeks)
- Debug logging indicates when fallback is used

## Schema

- **Base Table**: `lootaura_v2.items`
  - `image_url` (TEXT) - exists
  - `images` (TEXT[]) - exists (added in migration 035, ensured in 096)

- **View**: `public.items_v2`
  - Projects both `image_url` and `images` from base table
  - Used for reads only (writes go to base table)

## Testing Checklist

- [ ] Create new sale with items via SellWizard - verify images appear
- [ ] Update existing item image - verify both fields are set
- [ ] Verify backfill migration runs successfully
- [ ] Check debug logs - view fallback should be rare/absent
- [ ] Verify production items have both `images` and `image_url` populated

## Next Steps

1. **Deploy migration 097** to backfill existing items
2. **Monitor debug logs** for view fallback usage (should be rare)
3. **After 2-4 weeks**: Remove view fallback from `getSaleWithItems` if no issues
4. **Document**: Update API docs to reflect canonical image model

## Files Changed

- `lib/data/itemImageNormalization.ts` (new)
- `app/api/items_v2/route.ts`
- `app/api/items/route.ts`
- `app/(sales)/_actions.ts`
- `app/api/drafts/publish/route.ts`
- `lib/data/salesAccess.ts`
- `supabase/migrations/097_backfill_item_images_from_image_url.sql` (new)

