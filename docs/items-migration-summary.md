# Items Migration Summary

## Problem
Items are not appearing on sale detail pages, even for old production sales that previously worked. Diagnostic queries return "Success. No rows returned", suggesting legacy items are in a different table than where the code is reading.

## Solution: Canonical Items Table

### Canonical Base Table Decision
**`lootaura_v2.items` is the canonical base table for all items.**

All reads and writes should use this table (directly or via the `public.items_v2` view).

## Migration Steps

### STEP 1: Diagnostic Script ✅
Created `scripts/enumerate-items-tables.sql` to identify:
- All item-related tables (`public.sale_items`, `public.sale_items_legacy`, `lootaura_v2.items`)
- All item-related views (`public.items_v2`)
- Row counts and sample data from each
- Column structures for comparison

**Action Required**: Run this script in Supabase SQL editor with service-role/admin privileges to identify where legacy data is stored.

### STEP 2: Data Migration ✅
Created `supabase/migrations/096_migrate_legacy_items_to_canonical.sql` which:
- Ensures `lootaura_v2.items` has all necessary columns (category, condition, images, is_sold, image_url, updated_at)
- Migrates items from `public.sale_items` or `public.sale_items_legacy` to `lootaura_v2.items`
- Maps legacy columns:
  - `photo` → `image_url`
  - `purchased` → `is_sold`
  - `category`, `condition` → same
- Only migrates items whose `sale_id` exists in `lootaura_v2.sales` (skips orphaned items)
- Recreates `public.items_v2` view to include `image_url` and all columns
- Idempotent (can be run multiple times safely)

### STEP 3: Code Path Verification ✅
Verified all code paths:

**Writes** (correctly use canonical table):
- `app/api/items_v2/route.ts` - uses `fromBase(db, 'items')` → writes to `lootaura_v2.items`
- `app/api/sales/route.ts` - uses `fromBase(admin, 'items')` → writes to `lootaura_v2.items`
- `app/api/drafts/publish/route.ts` - uses `fromBase(admin, 'items')` → writes to `lootaura_v2.items`

**Reads** (correctly use view or base table):
- `lib/data/salesAccess.ts` - uses `fromBase(db, 'items')` → reads from `lootaura_v2.items` (with RLS)
- `app/api/items_v2/route.ts` - uses `.from('items_v2')` → reads from `public.items_v2` view
- `lib/hooks/useSales.ts` - uses `.from('items_v2')` → reads from `public.items_v2` view

**Note**: Some code uses `.from('items')` or `.from(T.items)` which queries the view. The view is writable (has INSERT/UPDATE/DELETE grants), so this is acceptable. However, for consistency, writes should use `fromBase` to write directly to the base table.

### STEP 4: RLS Policies ✅
RLS policies are correctly applied to `lootaura_v2.items`:
- `items_public_read` - allows public to read items from published sales
- `items_owner_read` - allows owners to read items from their own sales (any status)
- `items_owner_insert` - allows owners to insert items to their own sales
- `items_owner_update` - allows owners to update items in their own sales
- `items_owner_delete` - allows owners to delete items from their own sales

## Next Steps

1. **Run diagnostic script**: Execute `scripts/enumerate-items-tables.sql` in Supabase SQL editor to identify where legacy data is stored.

2. **Apply migration**: Run `supabase/migrations/096_migrate_legacy_items_to_canonical.sql` to migrate legacy items to the canonical table.

3. **Verify migration**: Check that:
   - Items appear in `lootaura_v2.items`
   - Items appear in `public.items_v2` view
   - Old sale detail pages show items again

4. **Test end-to-end**:
   - Create a new sale with items → verify items appear in `lootaura_v2.items`
   - Visit an old sale detail page → verify items appear
   - Test as both owner (authenticated) and public (anon) user

## Files Changed

- `scripts/enumerate-items-tables.sql` - Diagnostic script (NEW)
- `supabase/migrations/096_migrate_legacy_items_to_canonical.sql` - Data migration (NEW)
- `docs/items-migration-summary.md` - This document (NEW)

## Canonical Table Schema

```sql
lootaura_v2.items (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ,
  sale_id UUID REFERENCES lootaura_v2.sales(id),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  image_url TEXT,
  category TEXT,
  condition TEXT,
  images TEXT[],
  is_sold BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ
)
```

## View Definition

```sql
public.items_v2 AS
SELECT 
    id, created_at, sale_id, name, description, price,
    image_url, category, condition, images, is_sold, updated_at
FROM lootaura_v2.items
```

