# Dead-Code Removal Plan v2

**Plan Date:** 2025-10-23  
**Branch:** release/ui-refresh-simple-map  
**Phase:** Post-arbiter removal cleanup

## Removal Plan Overview

This plan categorizes dead code into three buckets based on confidence level and potential impact.

## Bucket 1: Remove Now (High Confidence)

### 1.1 Authority Props in Components
- **Files:** `components/SalesList.tsx`, `components/SaleCard.tsx`
- **Action:** Remove `authority` prop from component interfaces
- **Justification:** Props no longer used after arbiter removal
- **Risk:** None - props are unused
- **Verification:** Run tests to ensure no breakage

### 1.2 Orphaned Image Assets
- **Files:** `public/images/logo-white.png`, `public/images/profile.png`, `public/images/pin.svg`
- **Action:** Delete files
- **Justification:** No references found in codebase
- **Risk:** None - files are unreferenced
- **Verification:** Grep search confirms no references

### 1.3 Stale Test Files
- **Files:** `tests/integration/category-filters.test.ts`, `tests/integration/categoryFilters.test.ts`, `tests/integration/stabilization.spec.ts`
- **Action:** Delete files
- **Justification:** Test removed arbiter/authority functionality
- **Risk:** None - tests would fail anyway
- **Verification:** Run test suite to confirm no failures

### 1.4 Dead Environment Variable
- **File:** `env.example`
- **Action:** Remove `NEXT_PUBLIC_FEATURE_CLUSTERING` line
- **Justification:** Flag no longer gates behavior
- **Risk:** None - just documentation cleanup
- **Verification:** Check that clustering still works

## Bucket 2: Needs Review (Medium Confidence)

### 2.1 Health API Endpoints
- **Files:** `app/api/health/*` (multiple endpoints)
- **Action:** Investigate usage before removal
- **Justification:** May be used by monitoring/deployment systems
- **Risk:** Could break monitoring if removed
- **Action Required:** Check with deployment team

### 2.2 Viewport Management Libraries
- **Files:** `lib/map/viewportFetchManager.ts`, `lib/map/viewportPersistence.ts`
- **Action:** Verify usage before removal
- **Justification:** May be used for future viewport features
- **Risk:** Could break future features
- **Action Required:** Check imports in SalesMapClustered

## Bucket 3: Keep (False Positives)

### 3.1 Clustering Feature Flag in Code
- **Files:** `lib/clustering.ts`, `lib/flags.ts`
- **Action:** Keep
- **Justification:** Still used in tests and may be needed for future features
- **Risk:** Removing would break tests

### 3.2 Map Viewport Exports
- **Files:** `lib/map/viewportFetchManager.ts`
- **Action:** Keep
- **Justification:** Actively imported by SalesMapClustered
- **Risk:** Removing would break SalesMapClustered

## Implementation Strategy

### Phase 1: Safe Deletions (Commit 1)
- Remove authority props from components
- Delete orphaned image assets
- Remove dead environment variable from env.example

### Phase 2: Test Cleanup (Commit 2)
- Delete stale test files
- Update any remaining test references

### Phase 3: Documentation Update (Commit 3)
- Update README to remove references to removed flags
- Update any documentation that mentions removed functionality

## Verification Steps

After each commit:
1. Run `npm run lint` - should pass
2. Run `npm run typecheck` - should pass  
3. Run `npm test` - should pass
4. Run `npm run build` - should pass
5. Check that app still works (ZIP search, map, list sync)

## Rollback Plan

If any commit breaks functionality:
1. Revert the problematic commit
2. Move affected items to "needs_review" bucket
3. Investigate further before attempting removal

## Success Criteria

- ✅ All CI tests pass
- ✅ App behavior unchanged
- ✅ No references to removed items remain
- ✅ Bundle size reduced
- ✅ Documentation updated
