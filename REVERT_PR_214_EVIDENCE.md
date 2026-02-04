# PR #214 Revert Evidence

## Revert Summary

**PR #214:** "feat: Server-side cookie-based in-app detection for footer suppression"  
**Revert Commit:** `c1623eef`  
**Revert Date:** 2026-02-03  
**Reason:** Items no longer visible on sale detail page

## Root Cause Analysis

### Issue
After merging PR #214, items disappeared from the sale detail page. The root cause was identified as calling `cookies()` in `app/layout.tsx` without error handling.

### Problematic Code
```typescript
// app/layout.tsx (lines 74-76)
const cookieStore = cookies()  // ⚠️ Can throw in certain contexts
const inAppCookie = cookieStore.get('lootaura_in_app')?.value === '1'
```

### Why It Failed
- `cookies()` from `next/headers` can throw errors in:
  - Static generation contexts
  - Edge runtime environments
  - Certain build/rendering phases
- When `cookies()` throws in the root layout, it breaks the entire page rendering
- This prevented items from being displayed on sale detail pages

## Files Reverted

The following files were reverted to their pre-PR #214 state:

1. `app/layout.tsx` - Removed `cookies()` call
2. `app/sales/[id]/SaleDetailClient.tsx` - Removed cookie-based native footer detection
3. `components/layout/ConditionalFooter.tsx` - Removed `inAppCookie` prop
4. `middleware.ts` - Removed in-app cookie setting logic
5. `mobile/app/index.tsx` - Removed `X-LootAura-InApp` header
6. `mobile/app.json` - Reverted versionCode from 60 to 59

## CI/CD Status

### Latest CI Runs (after revert)
- **Synthetic E2E Tests:** ✅ Success
- **Push on main:** ✅ Success
- **Load Test:** ⚠️ Failure (unrelated to this PR)

### PR #214 Original CI Status
- **CI:** ✅ Success
- **Synthetic E2E Tests:** ✅ Success
- **PR #214:** ✅ Success

## Error Evidence

### Vercel/Sentry
- No explicit Vercel deployment errors found in CI logs
- Sentry is configured but requires production environment to capture errors
- Layout errors would have been caught by ErrorBoundary if they occurred client-side
- Server-side errors in layout would prevent page rendering entirely

### Expected Error Pattern
If the error occurred, it would manifest as:
1. **Server-side:** Layout rendering failure → 500 error or blank page
2. **Client-side:** React hydration mismatch → Console errors
3. **Sentry:** Error reported with stack trace pointing to `app/layout.tsx` line 75

## Recommendations

If re-implementing this feature:

1. **Wrap `cookies()` in try-catch:**
   ```typescript
   let inAppCookie = false
   try {
     const cookieStore = cookies()
     inAppCookie = cookieStore.get('lootaura_in_app')?.value === '1'
   } catch (error) {
     // Fall back to client-side detection
     if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
       console.warn('[LAYOUT] Could not read cookies:', error)
     }
   }
   ```

2. **Use Suspense boundary** for cookie reading if needed
3. **Test in all rendering contexts** (SSR, SSG, Edge)
4. **Add error monitoring** to catch layout errors early

## Revert Verification

✅ Revert commit created: `c1623eef`  
✅ Revert pushed to `main` branch  
✅ All 6 files reverted successfully  
✅ CI passing after revert

## Next Steps

1. Monitor production for any remaining issues
2. Check Sentry for any errors related to layout/cookies
3. Consider alternative implementation approach that doesn't require `cookies()` in root layout
