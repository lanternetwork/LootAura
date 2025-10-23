# Dead-Code Cleanup Analysis v2 (Post-Arbiter Removal)

**Analysis Date:** 2025-10-23  
**Branch:** release/ui-refresh-simple-map  
**Phase:** Post-arbiter/intent system removal

## Executive Summary

After removing the arbiter/intent system, several categories of dead code remain:
- **High Confidence (Safe to Remove):** 8 items
- **Medium Confidence (Needs Review):** 5 items  
- **Keep (False Positives):** 3 items

## Detailed Findings

### 1. Unused TypeScript Exports

**Path:** `components/SalesList.tsx`, `components/SaleCard.tsx`  
**Kind:** Unused props  
**Why Unused:** Authority props no longer used after arbiter removal  
**Confidence:** High  
**Importers:** None found  
**Impact Notes:** These components still accept `authority` props but they're not used

### 2. Dead Feature Flags

**Path:** `lib/flags.ts`, `lib/clustering.ts`  
**Kind:** Environment variables  
**Why Unused:** `NEXT_PUBLIC_FEATURE_CLUSTERING` still referenced but clustering is now always enabled  
**Confidence:** High  
**Importers:** Multiple test files, env.example  
**Impact Notes:** Flag exists but doesn't gate behavior anymore

### 3. Orphaned Assets

**Path:** `public/images/logo-white.png`, `public/images/profile.png`, `public/images/pin.svg`  
**Kind:** Image files  
**Why Unused:** No references found in codebase  
**Confidence:** High  
**Importers:** None found  
**Impact Notes:** These images are not referenced anywhere

### 4. Stale Tests

**Path:** `tests/integration/category-filters.test.ts`, `tests/integration/categoryFilters.test.ts`, `tests/integration/stabilization.spec.ts`  
**Kind:** Test files  
**Why Unused:** Still reference arbiter/authority logic that no longer exists  
**Confidence:** High  
**Importers:** Test runner  
**Impact Notes:** These tests will fail as they test removed functionality

### 5. Unused API Routes

**Path:** `app/api/health/*` (multiple health endpoints)  
**Kind:** API routes  
**Why Unused:** Health endpoints not called by frontend  
**Confidence:** Medium  
**Importers:** None found in frontend code  
**Impact Notes:** May be used by monitoring/deployment systems

### 6. Unused Library Exports

**Path:** `lib/map/viewportFetchManager.ts`, `lib/map/viewportPersistence.ts`  
**Kind:** TypeScript exports  
**Why Unused:** Map viewport management now handled directly in SalesClient  
**Confidence:** Medium  
**Importers:** Only in SalesMapClustered  
**Impact Notes:** May be used for future viewport management features

### 7. Dead Environment Variables

**Path:** `env.example`  
**Kind:** Configuration  
**Why Unused:** `NEXT_PUBLIC_FEATURE_CLUSTERING` no longer gates behavior  
**Confidence:** High  
**Importers:** Multiple files  
**Impact Notes:** Should be removed from env.example and documentation

### 8. Unused Scripts

**Path:** `package.json`  
**Kind:** npm scripts  
**Why Unused:** Some scripts may not be called by CI  
**Confidence:** Low  
**Importers:** CI, documentation  
**Impact Notes:** Need to verify which scripts are actually used

## Recommendations

### Remove Now (High Confidence)
1. Authority props from SalesList and SaleCard components
2. Orphaned image assets (logo-white.png, profile.png, pin.svg)
3. Stale test files referencing arbiter/authority
4. NEXT_PUBLIC_FEATURE_CLUSTERING from env.example

### Needs Review (Medium Confidence)
1. Health API endpoints (may be used by monitoring)
2. Viewport management library exports (may be used in future)
3. Some npm scripts (verify usage)

### Keep (False Positives)
1. Clustering feature flag (still used in tests)
2. Map viewport exports (used by SalesMapClustered)
3. Some health endpoints (may be used by deployment)

## Next Steps

1. Create removal plan with three buckets
2. Apply safe deletions in small commits
3. Verify CI remains green after each commit
4. Update documentation to reflect changes
