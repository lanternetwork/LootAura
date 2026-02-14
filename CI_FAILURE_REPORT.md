# CI Failure Report

**Date**: 2026-02-13  
**Run ID**: 21973646670  
**Branch**: `fix/release-blockers-rls-rate-limit`  
**Status**: ❌ FAILING

## Summary

Two integration test batches are failing:
1. **Batch 3/43**: `promotions.status.test.ts` - 3 tests failing (500 errors)
2. **Batch 13/43**: `moderation.report-sale.test.ts` - 3 tests failing (TypeError: fromBase(...).insert is not a function)

---

## Issue #1: `promotions.status.test.ts` - Missing `getRlsDb` Mock

### Failing Tests
- `enforces ownership for non-admins (filters out non-owned sale_ids)`
- `respects MAX_SALE_IDS cap by limiting to 100 unique IDs`
- `returns minimal response shape`

### Error
```
AssertionError: expected 500 to be 200 // Object.is equality
```

### Root Cause
The route `app/api/promotions/status/route.ts` was migrated from `getAdminDb()` to `getRlsDb()` (line 154), but the test file `tests/integration/api/promotions.status.test.ts` still only mocks `getAdminDb` (line 30). When the route calls `getRlsDb()`, it's not mocked, causing the function to throw an error (missing environment variables or cookies), resulting in a 500 response.

### Code Evidence
**Route** (`app/api/promotions/status/route.ts:154`):
```typescript
const rlsDb = getRlsDb()  // ← Uses getRlsDb()
```

**Test** (`tests/integration/api/promotions.status.test.ts:29-32`):
```typescript
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,  // ← Only mocks getAdminDb
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))
// ❌ Missing getRlsDb mock!
```

### Fix Required
Add `getRlsDb` mock to the test file:
```typescript
vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,  // ← Add this
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))
```

Also need to create a `mockRlsDb` object similar to `mockAdminDb`.

---

## Issue #2: `moderation.report-sale.test.ts` - Incomplete Query Chain Mock

### Failing Tests
- `creates a report for a visible sale`
- `auto-hides sale when threshold of unique reporters is reached`
- `does not auto-hide if threshold not reached`

### Error
```
TypeError: fromBase(...).insert is not a function
❯ reportHandler app/api/sales/[id]/report/route.ts:105:6
```

### Root Cause
The route calls `fromBase(rlsDb, 'sale_reports').insert({...}).select('id').single()` (lines 104-113), which requires a chainable query builder. The test's `fromBase` mock returns `db.from(table)`, which should return `mockReportChain`. However, `mockReportChain` is created once at module level using `createReportChain()`, but the `fromBase` mock is reusing the same instance. The issue is that `mockReportChain` needs to be a fresh chain instance each time, or the mock needs to ensure it returns a properly chainable object.

### Code Evidence
**Route** (`app/api/sales/[id]/report/route.ts:104-113`):
```typescript
const { error: insertError } = await fromBase(rlsDb, 'sale_reports')
  .insert({...})      // ← Needs chainable insert
  .select('id')       // ← Needs chainable select
  .single()           // ← Needs chainable single
```

**Test** (`tests/integration/moderation.report-sale.test.ts:117-127`):
```typescript
vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => {
    if (table === 'profiles') {
      return createQueryChain()
    }
    const result = db.from(table)  // ← Returns mockReportChain
    return result || mockReportChain
  },
}))
```

**Mock Setup** (`tests/integration/moderation.report-sale.test.ts:56-68`):
```typescript
const createReportChain = () => {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),  // ← Should return chain
    // ...
  }
  return chain
}

const mockReportChain = createReportChain()  // ← Created once
```

The problem: `mockReportChain` is created once, but when `fromBase` is called, it should return a fresh chain. However, `db.from('sale_reports')` returns the same `mockReportChain` instance. The chain methods should work, but there might be an issue with how the mock is set up.

### Fix Required
Ensure `fromBase` returns a fresh chain instance for `sale_reports`:
```typescript
fromBase: (db: any, table: string) => {
  if (table === 'profiles') {
    return createQueryChain()
  }
  if (table === 'sale_reports') {
    return createReportChain()  // ← Return fresh chain, not cached instance
  }
  const result = db.from(table)
  return result || createReportChain()
}
```

Or ensure `mockRlsDb.from('sale_reports')` returns a fresh chain each time:
```typescript
const mockRlsDb = {
  from: vi.fn((table: string) => {
    if (table === 'sale_reports') return createReportChain()  // ← Fresh chain
    // ...
  }) as any,
}
```

---

## Impact

- **Production**: No impact (these are test failures only)
- **CI/CD**: Blocks PR merge
- **Test Coverage**: 6 integration tests are failing, reducing confidence in RLS migration

---

## Next Steps

1. **Fix `promotions.status.test.ts`**:
   - Add `getRlsDb` mock
   - Create `mockRlsDb` object
   - Update test setup to use RLS-aware mocks

2. **Fix `moderation.report-sale.test.ts`**:
   - Ensure `fromBase` returns fresh chain instances for `sale_reports`
   - Verify chain methods (`insert`, `select`, `single`) are properly chained

3. **Verify**:
   - Run tests locally: `npm run test:integration`
   - Push changes and verify CI passes

---

## Related Changes

These failures are related to the RLS migration work:
- `app/api/promotions/status/route.ts` was migrated from `getAdminDb()` to `getRlsDb()`
- `app/api/sales/[id]/report/route.ts` was migrated to use `getRlsDb()` for inserts

The tests were not fully updated to match the new implementation.
