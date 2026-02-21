# Draft System Enterprise Fixes - Validation Checklist

**Date**: 2024-12-19  
**Purpose**: Evidence bundle confirming 3 enterprise-gap fixes are correct in production  
**Mode**: Verification only (no code changes)

---

## 1. Photo Order Hashing Verification

### Code Evidence

**File**: `lib/draft/normalize.ts` (lines 36-39)

```typescript
// Photos: preserve user-defined order (do not sort)
// Users can reorder photos, so order is meaningful and must be preserved
const normalizedPhotos = [...(payload.photos || [])]
  .filter(Boolean)
```

### Verification Confirmation

✅ **Photos are NOT sorted** - No `.sort()` call present  
✅ **Only filtering occurs** - `.filter(Boolean)` removes empty/null values  
✅ **Order is preserved** - Array spread `[...]` maintains original order

### Test Evidence

**File**: `tests/integration/drafts.api.test.ts`

#### Test 1: Different Order → Different Hash
**Test Name**: `'should produce different hashes for same photos in different order'` (lines 188-221)

```typescript
it('should produce different hashes for same photos in different order', async () => {
  const photo1 = 'https://example.com/photo1.jpg'
  const photo2 = 'https://example.com/photo2.jpg'
  const photo3 = 'https://example.com/photo3.jpg'

  // Same photos, different order
  const payload1 = { ...mockDraftPayload, photos: [photo1, photo2, photo3] }
  const payload2 = { ...mockDraftPayload, photos: [photo3, photo1, photo2] }

  const normalized1 = normalizeDraftPayload(payload1)
  const normalized2 = normalizeDraftPayload(payload2)

  const hash1 = createHash('sha256').update(JSON.stringify(normalized1)).digest('hex')
  const hash2 = createHash('sha256').update(JSON.stringify(normalized2)).digest('hex')

  // Hashes should differ because photo order is meaningful
  expect(hash1).not.toBe(hash2)
  // Photos should preserve their original order
  expect(normalized1.photos).toEqual([photo1, photo2, photo3])
  expect(normalized2.photos).toEqual([photo3, photo1, photo2])
})
```

**Expected Behavior**: ✅ Different order → Different hash  
**Order Preservation**: ✅ Original order maintained in normalized output

#### Test 2: Same Order → Same Hash
**Test Name**: `'should produce same hash for same photos in same order'` (lines 223-250)

```typescript
it('should produce same hash for same photos in same order', async () => {
  const photo1 = 'https://example.com/photo1.jpg'
  const photo2 = 'https://example.com/photo2.jpg'

  // Same photos, same order
  const payload1 = { ...mockDraftPayload, photos: [photo1, photo2] }
  const payload2 = { ...mockDraftPayload, photos: [photo1, photo2] }

  const normalized1 = normalizeDraftPayload(payload1)
  const normalized2 = normalizeDraftPayload(payload2)

  const hash1 = createHash('sha256').update(JSON.stringify(normalized1)).digest('hex')
  const hash2 = createHash('sha256').update(JSON.stringify(normalized2)).digest('hex')

  // Hashes should match because photos are in the same order
  expect(hash1).toBe(hash2)
  expect(normalized1.photos).toEqual(normalized2.photos)
})
```

**Expected Behavior**: ✅ Same order → Same hash

### Deliverable Summary

✅ **Code Evidence**: Photos normalization snippet confirms no sorting, only filtering  
✅ **Test Evidence**: Two tests verify order preservation and hash behavior  
✅ **Expected Behavior**: Different order → different hash; same order → same hash

---

## 2. RLS Policy Verification SQL

### Migration Evidence

**File**: `supabase/migrations/143_add_with_check_to_sale_drafts_update_policy.sql` (lines 14-17)

```sql
CREATE POLICY "update own drafts"
  ON lootaura_v2.sale_drafts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Verification SQL Commands

Run these commands in **Supabase SQL Editor** to verify the deployed policy:

#### Query 1: Check Policy Definition

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'lootaura_v2'
  AND tablename = 'sale_drafts'
  AND cmd = 'UPDATE';
```

#### Expected Output

| schemaname | tablename | policyname | cmd | qual | with_check |
|------------|-----------|------------|-----|------|------------|
| lootaura_v2 | sale_drafts | update own drafts | UPDATE | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |

**Key Verification Points**:
- ✅ `qual` column contains `(auth.uid() = user_id)` (USING clause)
- ✅ `with_check` column contains `(auth.uid() = user_id)` (WITH CHECK clause)
- ✅ Both clauses are present and identical

#### Query 2: Alternative Check via pg_policy System Catalog

```sql
SELECT 
  pol.polname AS policy_name,
  pol.polcmd AS command,
  pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
  pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expression
FROM pg_policy pol
JOIN pg_class pc ON pol.polrelid = pc.oid
JOIN pg_namespace pn ON pc.relnamespace = pn.oid
WHERE pn.nspname = 'lootaura_v2'
  AND pc.relname = 'sale_drafts'
  AND pol.polname = 'update own drafts'
  AND pol.polcmd = 'r'; -- 'r' = UPDATE command
```

#### Expected Output

| policy_name | command | using_expression | with_check_expression |
|-------------|---------|------------------|----------------------|
| update own drafts | r | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |

**Key Verification Points**:
- ✅ `using_expression` is not NULL and contains `auth.uid() = user_id`
- ✅ `with_check_expression` is not NULL and contains `auth.uid() = user_id`
- ✅ Both expressions are identical

### Deliverable Summary

✅ **SQL Commands**: Two queries provided (pg_policies view and pg_policy catalog)  
✅ **Expected Output**: Both queries should show `with_check` containing `auth.uid() = user_id`  
✅ **Verification**: Policy has both USING and WITH CHECK clauses

---

## 3. Grants Verification SQL

### Migration Evidence

**File**: `supabase/migrations/144_grant_sale_drafts_full_access.sql` (line 10)

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lootaura_v2.sale_drafts TO authenticated;
```

### Verification SQL Commands

Run these commands in **Supabase SQL Editor** to verify the deployed grants:

#### Query 1: Check Table Privileges (has_table_privilege)

```sql
SELECT 
  has_table_privilege('authenticated', 'lootaura_v2.sale_drafts', 'SELECT') AS has_select,
  has_table_privilege('authenticated', 'lootaura_v2.sale_drafts', 'INSERT') AS has_insert,
  has_table_privilege('authenticated', 'lootaura_v2.sale_drafts', 'UPDATE') AS has_update,
  has_table_privilege('authenticated', 'lootaura_v2.sale_drafts', 'DELETE') AS has_delete;
```

#### Expected Output

| has_select | has_insert | has_update | has_delete |
|------------|------------|------------|------------|
| true | true | true | true |

**Key Verification Points**:
- ✅ All four privileges return `true`
- ✅ SELECT is explicitly granted (was not explicit before)
- ✅ DELETE is explicitly granted (was not explicit before)

#### Query 2: List All Grants (information_schema.role_table_grants)

```sql
SELECT 
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'lootaura_v2'
  AND table_name = 'sale_drafts'
  AND grantee = 'authenticated'
ORDER BY privilege_type;
```

#### Expected Output

| grantee | privilege_type | is_grantable |
|---------|----------------|--------------|
| authenticated | DELETE | NO |
| authenticated | INSERT | NO |
| authenticated | SELECT | NO |
| authenticated | UPDATE | NO |

**Key Verification Points**:
- ✅ All four privileges (SELECT, INSERT, UPDATE, DELETE) are listed
- ✅ Grantee is `authenticated` role
- ✅ Table is `lootaura_v2.sale_drafts` (base table, not view)

#### Query 3: Verify Base Table vs View Grants (Distinction)

```sql
-- Base table grants
SELECT 
  'base_table' AS source,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'lootaura_v2'
  AND table_name = 'sale_drafts'
  AND grantee = 'authenticated'

UNION ALL

-- View grants (should be separate)
SELECT 
  'view' AS source,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'sale_drafts'
  AND grantee = 'authenticated'
ORDER BY source, privilege_type;
```

#### Expected Output

| source | grantee | privilege_type |
|--------|---------|----------------|
| base_table | authenticated | DELETE |
| base_table | authenticated | INSERT |
| base_table | authenticated | SELECT |
| base_table | authenticated | UPDATE |
| view | authenticated | DELETE |
| view | authenticated | INSERT |
| view | authenticated | SELECT |
| view | authenticated | UPDATE |

**Key Verification Points**:
- ✅ Base table (`lootaura_v2.sale_drafts`) has all four privileges
- ✅ View (`public.sale_drafts`) grants are separate (not touched by migration 144)
- ✅ Both have full access, but grants are explicit on base table

### Deliverable Summary

✅ **SQL Commands**: Three queries provided (has_table_privilege, role_table_grants, base vs view)  
✅ **Expected Results**: All four privileges return `true` / are listed for base table  
✅ **Verification**: SELECT and DELETE are now explicit (were not before migration 144)

---

## 4. Manual Runtime Validation Steps

### Test Plan: End-to-End Validation in Production/Preview

#### Prerequisites
- Authenticated user session
- Access to sale creation wizard (`/sell/new`)
- Ability to upload/reorder photos

#### Test Steps

##### Test 1: Photo Order Persistence

1. **Create Draft with Multiple Photos**
   - Navigate to `/sell/new`
   - Fill in required fields (title, address, etc.)
   - Upload at least 2 photos (e.g., photo1.jpg, photo2.jpg, photo3.jpg)
   - Observe initial photo order: [photo1, photo2, photo3]

2. **Reorder Photos**
   - Use drag-and-drop or reorder controls to change order
   - New order: [photo3, photo1, photo2]
   - Wait for autosave to complete (check status indicator)

3. **Trigger Autosave**
   - Make a small change (e.g., edit title) to trigger autosave
   - Wait for "Saved" status (not "Saving" or "Error")
   - Verify no 429 errors in browser console

4. **Refresh and Verify Order**
   - Refresh the page (F5 or reload)
   - Draft should restore from server
   - **Expected**: Photo order should be [photo3, photo1, photo2] (preserved)
   - **Failure**: If order reverts to [photo1, photo2, photo3], photo order is not preserved

##### Test 2: Hash Behavior (No Unnecessary Writes)

1. **Create Draft with Photos**
   - Create draft with photos in order [A, B, C]
   - Wait for autosave to complete
   - Note: This should trigger a write (new draft)

2. **Reorder Photos (Same Order)**
   - Reorder photos back to [A, B, C] (same as original)
   - Make a small change to trigger autosave
   - **Expected**: Autosave should complete quickly (no-op if hash matches)
   - **Failure**: If autosave takes long or triggers 429, hash may not be working correctly

3. **Reorder Photos (Different Order)**
   - Reorder photos to [C, A, B] (different order)
   - Make a small change to trigger autosave
   - **Expected**: Autosave should trigger a write (hash differs)
   - **Failure**: If no write occurs, photo order may not affect hash

##### Test 3: Rate Limit Behavior

1. **Normal Typing Test**
   - Create/edit a draft
   - Type rapidly in title/description fields
   - **Expected**: No 429 errors during normal typing
   - **Expected**: Autosave status shows "Saved" or "Saving" (not "Paused" or "Error")
   - **Failure**: If 429 errors appear frequently, rate limiting may be too aggressive

2. **Rapid Photo Reordering**
   - Upload multiple photos
   - Rapidly reorder photos multiple times
   - **Expected**: Autosave handles reordering gracefully
   - **Expected**: No bursty 429 errors
   - **Failure**: If 429 errors appear, single-flight pattern may not be working

##### Test 4: Multi-Tab Conflict Detection (Optional)

1. **Open Draft in Two Tabs**
   - Create/edit a draft in Tab 1
   - Open same draft in Tab 2 (same draft_key)
   - Wait for both to load

2. **Make Conflicting Edits**
   - In Tab 1: Edit title to "Title A", wait for autosave
   - In Tab 2: Edit title to "Title B", wait for autosave
   - **Expected**: One tab should receive 409 CONFLICT (version mismatch)
   - **Expected**: Error message indicates draft was modified elsewhere
   - **Failure**: If both edits succeed silently, OCC may not be working

3. **Verify Conflict Handling**
   - Tab with 409 should show error message
   - Tab without 409 should show updated draft
   - **Expected**: User can refresh and retry
   - **Failure**: If no 409 occurs, version checking may not be working

### Success Criteria

✅ **Photo Order Persists**: After refresh, photos maintain user-defined order  
✅ **No Unnecessary Writes**: Same photo order = no-op (hash matches)  
✅ **Different Order Triggers Write**: Different photo order = write (hash differs)  
✅ **No Bursty 429s**: Normal typing doesn't trigger rate limits  
✅ **409 Conflicts Work**: Multi-tab editing detects version conflicts

### Failure Indicators

❌ **Photo order reverts** after refresh → Photo order not preserved in hash  
❌ **Frequent 429 errors** during normal typing → Rate limiting too aggressive  
❌ **No 409 conflicts** in multi-tab test → OCC version checking not working  
❌ **Autosave fails** with permission errors → Grants may not be applied

### Deliverable Summary

✅ **Test Steps**: 4 test scenarios covering photo order, hashing, rate limits, and conflicts  
✅ **Success Criteria**: Clear pass/fail conditions for each test  
✅ **Failure Indicators**: What to look for if fixes aren't working

---

## Summary

### Verification Status

| Fix | Code Evidence | SQL Verification | Test Evidence | Manual Validation |
|-----|---------------|------------------|---------------|-------------------|
| **Photo Order Hashing** | ✅ No sorting in code | N/A | ✅ Two tests verify behavior | ✅ Test steps provided |
| **RLS WITH CHECK** | ✅ Migration SQL | ✅ Two SQL queries | N/A | ✅ Implicit in draft updates |
| **Explicit Grants** | ✅ Migration SQL | ✅ Three SQL queries | N/A | ✅ Implicit in draft operations |

### Next Steps

1. **Run SQL Verification** (Sections 2 & 3) in Supabase SQL Editor
2. **Execute Manual Tests** (Section 4) in production/preview environment
3. **Document Results** - Record pass/fail for each test
4. **Address Failures** - If any tests fail, investigate and fix

### Evidence Bundle Complete

✅ All verification artifacts provided  
✅ SQL commands are copy-paste ready  
✅ Test steps are actionable  
✅ No code changes required for verification

---

**Validation Complete** - Evidence bundle compiled. Ready for production verification.
