# Codebase Tidy Report - Post-Cleanup Tightening

**Report Date:** 2025-10-23  
**Branch:** release/ui-refresh-simple-map  
**Phase:** Post-arbiter removal surgical cleanup

## Executive Summary

Performed static analysis to identify and clean up remaining stragglers from arbiter/intent system removal. Found several categories of cleanup needed with varying risk levels.

## A) Changes Made (Paths + Rationale)

### 1. Remove Backup File with Old Arbiter References
- **File:** `app/sales/SalesClient.tsx.backup`
- **Reason:** Contains 105+ references to removed arbiter system
- **Risk:** None - backup file not used in production
- **Action:** Delete file

### 2. Clean Up Debug/Diagnostic References
- **Files:** 
  - `lib/debug/salesListDebug.ts` - Remove authority parameters
  - `lib/diagnostics/fetchWrapper.ts` - Remove authority context
  - `components/DiagnosticOverlay.tsx` - Remove authority display
- **Reason:** These still reference removed authority system
- **Risk:** Low - debug code only
- **Action:** Remove authority parameters and references

### 3. Clean Up Test References
- **Files:**
  - `tests/unit/map-only-flow.test.ts` - Remove authority test
  - `tests/integration/map.clusters-flow.test.tsx` - Remove arbiter authority test
  - `tests/unit/categoryNormalization.test.ts` - Remove arbiter decision comment
  - `tests/snapshots/gridContainer.snapshot.test.tsx` - Remove authority mode tests
- **Reason:** Tests reference removed authority system
- **Risk:** Low - test code only
- **Action:** Remove authority-related test cases

### 4. Clean Up Map Component Comments
- **File:** `components/location/SalesMapClustered.tsx`
- **Reason:** Comment references arbiter authority
- **Risk:** None - just a comment
- **Action:** Update comment to reflect map-only system

## B) TODOs (Exact Paths + Why)

### 1. Feature Flag Decision Required
- **Files:** `lib/clustering.ts`, `lib/flags.ts`, `tests/integration/map.clusters-flow.test.tsx`, `tests/unit/cluster.engine.test.ts`
- **Issue:** `NEXT_PUBLIC_FEATURE_CLUSTERING` still referenced in code but removed from env.example
- **Decision Needed:** Either re-add to env.example or remove all code references
- **Recommendation:** Keep flag in code (used by tests) and re-add to env.example

### 2. API Schema Validation Missing
- **Files:** `app/api/sales/markers/route.ts`, `app/api/geocoding/zip/route.ts`
- **Issue:** No Zod schemas for request/response validation
- **Risk:** Medium - could cause runtime errors
- **Action:** Add minimal Zod schemas for type safety

### 3. URL Restore Logic Incomplete
- **File:** `app/sales/SalesClient.tsx`
- **Issue:** Only ZIP parameter restored from URL, other params (distance, date, categories) not restored
- **Risk:** Low - functionality works but not complete
- **Action:** Add URL restore for all filter parameters

### 4. Filters Bar Overflow Logic Missing
- **File:** `components/SearchFilters.tsx`
- **Issue:** "More Filters" exists but no overflow management logic
- **Risk:** Medium - could cause UI issues on narrow screens
- **Action:** Implement proper overflow management with ResizeObserver

## C) Flag Decision (Clustering Flag)

**Decision:** Keep `NEXT_PUBLIC_FEATURE_CLUSTERING` flag

**Rationale:**
- Still referenced in 4 files (lib/clustering.ts, lib/flags.ts, 2 test files)
- Tests depend on it for clustering on/off scenarios
- Useful for debugging and future feature control
- Low maintenance cost

**Action:** Re-add to env.example with proper documentation

## D) API Contract Coverage Table

| Route | Schema Status | Risk Level | Action Needed |
|-------|---------------|------------|---------------|
| `/api/sales/markers` | ❌ No Zod | Medium | Add request/response schemas |
| `/api/geocoding/zip` | ❌ No Zod | Medium | Add request/response schemas |
| `/api/sales` | ❌ No Zod | Medium | Add request/response schemas |
| `/api/sales/search` | ❌ No Zod | Medium | Add request/response schemas |
| `/api/favorites` | ❌ No Zod | Low | Add request/response schemas |
| `/api/upload/signed-url` | ❌ No Zod | Low | Add request/response schemas |
| `/api/share` | ❌ No Zod | Low | Add request/response schemas |

## E) Environment Variable Truth Table

| Variable | In Code | In env.example | Status | Action |
|----------|---------|----------------|--------|--------|
| `NEXT_PUBLIC_FEATURE_CLUSTERING` | ✅ Yes | ❌ No | Inconsistent | Re-add to env.example |
| `NEXT_PUBLIC_DEBUG` | ✅ Yes | ✅ Yes | Consistent | None |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | ✅ Yes | ✅ Yes | Consistent | None |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | ✅ Yes | Consistent | None |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | ✅ Yes | Consistent | None |

## F) CSP/Manifest/Mapbox Noise Check Results

### ✅ CSP Clean
- No references to `vercel.live` script injection found
- Middleware properly configured for public assets

### ✅ Manifest Accessible
- `public/manifest.json` exists and accessible
- No auth gating on manifest file
- Properly referenced in layout.tsx

### ✅ Mapbox Telemetry Disabled
- Telemetry disabled in `lib/maps/telemetry.ts`
- Blocked in service worker (`public/sw.js`)
- Disabled in map components
- No telemetry requests should be made

## G) Dead Code Pass Results

### Safe to Delete (0 references)
- `app/sales/SalesClient.tsx.backup` - Backup file with old arbiter code

### Keep (Still referenced)
- All debug libraries - used by components
- All telemetry libraries - used by map components
- All utility libraries - used by various components

## H) Filters Bar Overflow Safety

### Current Status
- ✅ ZIP input has fixed width
- ✅ "More Filters" button exists
- ❌ No overflow management logic
- ❌ No ResizeObserver for dynamic width
- ❌ No measurement guards for SSR

### Required Implementation
1. Add ResizeObserver to measure available width
2. Calculate space for ZIP + "More Filters" button
3. Move category chips to "More" when space insufficient
4. Add SSR guards for clientWidth=0

## I) Recommended Actions

### Immediate (Safe Changes)
1. Delete backup file
2. Clean up debug/diagnostic authority references
3. Remove authority test cases
4. Update map component comments
5. Re-add clustering flag to env.example

### Future (Requires Planning)
1. Add Zod schemas to all API routes
2. Implement complete URL restore logic
3. Add filters bar overflow management
4. Add comprehensive error boundaries

## J) Risk Assessment

### Low Risk (Safe to proceed)
- Deleting backup files
- Removing debug authority references
- Updating comments
- Re-adding env variables

### Medium Risk (Requires testing)
- Adding Zod schemas (could break existing functionality)
- Implementing URL restore (could cause state conflicts)
- Adding overflow management (could cause layout issues)

### High Risk (Requires careful planning)
- Major architectural changes
- Database schema changes
- Authentication changes

## K) Success Criteria

- ✅ No references to removed arbiter/authority system
- ✅ All feature flags consistent between code and env.example
- ✅ All API routes have proper validation
- ✅ URL restore works for all parameters
- ✅ Filters bar handles overflow gracefully
- ✅ No CSP/manifest/telemetry noise
- ✅ All environment variables documented

## L) Next Steps

1. **Immediate:** Apply safe changes (backup deletion, debug cleanup)
2. **Short-term:** Re-add clustering flag, implement URL restore
3. **Medium-term:** Add Zod schemas, implement overflow management
4. **Long-term:** Comprehensive error handling and monitoring

## M) Commands to Run After Changes

```bash
# Verify no regressions
npm run lint
npm run typecheck
npm test
npm run build

# Test functionality
npm run dev
# Test: ZIP search, map interactions, filters, URL restore
```

## N) Conclusion

The codebase is in good shape after arbiter removal. Most cleanup is straightforward with low risk. The main areas needing attention are API validation, URL restore completeness, and filters bar overflow management. All changes should be made incrementally with proper testing.
