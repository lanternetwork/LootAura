# Cleanup Audit - Sale Publishing Incident Artifacts

## A. Scope

Cleanup after sale publishing incident. Remove debug-only and documentation artifacts created during investigation.

## B. Candidate Deletions (with Evidence)

### Docs to Delete (No Code References)

#### 1. `AUDIT_REPORT.md`
- **Reason:** Investigation artifact documenting sale publishing fix
- **Evidence:** No imports/references; docs-only. Created during PR #279 investigation.
- **Lines:** Entire file (root directory)

#### 2. `AUDIT_REPORT_ITEMS_FIX.md`
- **Reason:** Investigation artifact documenting item creation fix
- **Evidence:** No imports/references; docs-only. Created during PR #280 investigation.
- **Lines:** Entire file (root directory)

#### 3. `AUDIT_REPORT_RLS_SESSION_FIX.md`
- **Reason:** Investigation artifact documenting RLS session handling fixes
- **Evidence:** No imports/references; docs-only. Created during PR #280 investigation.
- **Lines:** Entire file (root directory)

#### 4. `AUDIT_REPORT_DRAFTS_PROMOTIONS_FIX.md`
- **Reason:** Investigation artifact documenting drafts and promotions fixes
- **Evidence:** No imports/references; docs-only. Created during PR #282 investigation.
- **Lines:** Entire file (root directory)

### Debug-Only Code Blocks to Delete (Gated by NEXT_PUBLIC_DEBUG)

#### 1. `app/api/sales/route.ts` - Debug Logging Blocks

**Block 1: Auth Context Check Debug (Lines ~1041-1058)**
- **Identifiers being removed:**
  - `hasAccessToken` variable
  - `sessionUserId` variable
  - `userIdsMatch` variable
  - `logger.debug('Auth context check', ...)` call
  - Log fields: `getSessionHasAccessToken`, `sessionUserId`, `userIdsMatch`
- **Evidence:** Only executed when `process.env.NEXT_PUBLIC_DEBUG === 'true'`; not required for runtime behavior
- **Context:**
  ```typescript
  // Debug-only: Log auth.getUser() results
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const { logger } = await import('@/lib/log')
    const sessionResponse = await supabase.auth.getSession()
    const hasAccessToken = !!sessionResponse?.data?.session?.access_token
    const sessionUserId = sessionResponse?.data?.session?.user?.id
    
    logger.debug('Auth context check', {
      component: 'sales',
      operation: 'auth_check',
      getUserSuccess: !!user,
      getUserError: !!authResponse?.error,
      getSessionHasAccessToken: hasAccessToken,
      getSessionError: !!sessionResponse?.error,
      sessionUserId: sessionUserId ? sessionUserId.substring(0, 8) + '...' : 'null',
      userIdsMatch: sessionUserId === user?.id,
    })
  }
  ```

**Block 2: RLS Write Auth Context Debug (Lines ~1233-1249)**
- **Identifiers being removed:**
  - `hasAccessToken` variable
  - `sessionUserId` variable
  - `userIdsMatch` variable
  - `logger.debug('RLS write auth context', ...)` call
  - Log fields: `usingSameClient`, `hasAccessToken`, `sessionUserId`, `ownerIdToInsert`, `userIdsMatch`
- **Evidence:** Only executed when `process.env.NEXT_PUBLIC_DEBUG === 'true'`; not required for runtime behavior
- **Context:**
  ```typescript
  // Debug-only: Verify session is available on RLS client
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const { logger } = await import('@/lib/log')
    const sessionCheck = await supabase.auth.getSession()
    const hasAccessToken = !!sessionCheck?.data?.session?.access_token
    const sessionUserId = sessionCheck?.data?.session?.user?.id
    
    logger.debug('RLS write auth context', {
      component: 'sales',
      operation: 'sale_create',
      usingSameClient: true,
      hasAccessToken: hasAccessToken,
      sessionUserId: sessionUserId ? sessionUserId.substring(0, 8) + '...' : 'null',
      ownerIdToInsert: user?.id ? user.id.substring(0, 8) + '...' : 'null',
      userIdsMatch: sessionUserId === user?.id,
    })
  }
  ```

**Block 3: Sale Insert Error Debug (Lines ~1318-1337)**
- **Identifiers being removed:**
  - `sessionUserId` variable
  - `userIdsMatch` variable
  - `logger.debug('Sale insert error (first attempt)', ...)` call
  - Log fields: `sessionUserId`, `userIdsMatch`, `ownerIdAttempted`
- **Evidence:** Only executed when `process.env.NEXT_PUBLIC_DEBUG === 'true'`; not required for runtime behavior
- **Context:**
  ```typescript
  // Debug-only: Log error code and message for RLS diagnosis
  if (error && process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const { logger } = await import('@/lib/log')
    const sessionResponse = await supabase.auth.getSession()
    const sessionUserId = sessionResponse?.data?.session?.user?.id
    logger.debug('Sale insert error (first attempt)', {
      component: 'sales',
      operation: 'sale_insert',
      attempt: 1,
      errorCode: error?.code || 'unknown',
      errorMessage: error?.message || String(error),
      errorDetails: error?.details || null,
      errorHint: error?.hint || null,
      ownerIdAttempted: user?.id ? user.id.substring(0, 8) + '...' : 'null',
      sessionUserId: sessionUserId ? sessionUserId.substring(0, 8) + '...' : 'null',
      userIdsMatch: sessionUserId === user?.id,
      // RLS policy requires: auth.uid() = owner_id
      // This log helps diagnose if auth.uid() is null or mismatched
    })
  }
  ```

#### 2. `app/api/drafts/route.ts` - Debug Cookie/Session Checks

**Block: Cookie Existence Check Debug (Lines ~260-279)**
- **Identifiers being removed:**
  - `hasAccessToken` variable (cookie check)
  - `hasRefreshToken` variable
  - `logger.debug('RLS write cookie check', ...)` call
  - Log fields: `hasAccessTokenCookie`, `hasRefreshTokenCookie`, `supabaseCookieCount`
- **Evidence:** Only executed when `process.env.NEXT_PUBLIC_DEBUG === 'true'`; not required for runtime behavior
- **Context:**
  ```typescript
  // Debug-only: verify cookie existence before RLS write
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    try {
      const cookieStore = cookies()
      // Check common Supabase cookie patterns
      const allCookies = cookieStore.getAll()
      const supabaseCookies = allCookies.filter(c => c.name.includes('sb-') || c.name.includes('supabase'))
      const hasAccessToken = supabaseCookies.some(c => c.name.includes('access-token') || c.name.includes('auth-token'))
      const hasRefreshToken = supabaseCookies.some(c => c.name.includes('refresh-token'))
      
      const { logger } = await import('@/lib/log')
      logger.debug('RLS write cookie check', {
        component: 'drafts',
        operation: 'saveDraft',
        hasAccessTokenCookie: hasAccessToken,
        hasRefreshTokenCookie: hasRefreshToken,
        supabaseCookieCount: supabaseCookies.length,
      })
    } catch (_error) {
      // Ignore cookie access errors in test environments
      // cookies() may not be available in all test contexts
    }
  }
  ```

#### 3. `lib/supabase/clients.ts` - Debug Logging

**Block: Cookie Setting Failure Debug (Lines ~38-44)**
- **Identifiers being removed:**
  - `logger.debug('getRlsDb: cookie setting failed', ...)` call
  - Debug logging for cookie setting errors
- **Evidence:** Only executed when `process.env.NEXT_PUBLIC_DEBUG === 'true'`; not required for runtime behavior
- **Context:**
  ```typescript
  } catch (error) {
    // Cookie setting can fail in some contexts, that's ok
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      logger.debug('getRlsDb: cookie setting failed', {
        component: 'supabase',
        operation: 'getRlsDb',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  ```

## C. Explicit Non-Goals

**Do NOT remove or change:**

1. **`setSession()` usage** - Required for RLS to work correctly
   - `app/api/sales/route.ts:1220-1227`
   - `app/api/items_v2/route.ts:141-149`
   - `app/api/promotions/status/route.ts:160-168`
   - `app/api/drafts/route.ts:246-254, 428-436`
   - `lib/supabase/clients.ts:62-71`

2. **`getSession()` usage** - Required for session loading
   - All routes use this for explicit session handling

3. **`isRlsError` production error handling** - Required for proper error responses
   - `app/api/sales/route.ts:1376-1420`
   - `app/api/drafts/route.ts:327-340`

4. **Migrations 139 / 140** - Permanent database changes
   - `supabase/migrations/139_grant_sales_insert.sql`
   - `supabase/migrations/140_grant_items_insert.sql`

5. **Tests/mocks** - Required for CI
   - `tests/integration/api/sales.rls-error.test.ts`
   - `tests/integration/api/promotions.status.test.ts`
   - `tests/integration/drafts.api.test.ts`
   - All other test files

6. **Production error logging** - Required for monitoring
   - `app/api/sales/route.ts:1388-1404` (RLS error logging - always runs)
   - `app/api/sales/route.ts:1060-1069` (Non-debug auth error logging)

7. **Test-only code** - Required for test environment
   - `app/api/sales/route.ts:1252-1276` (synthetic sale creation for tests)

## D. Risk Assessment

### Docs Deletion: **Low Risk**
- No code references
- Documentation only
- Can be recovered from git history if needed
- **Impact:** None on runtime behavior

### Debug-Block Deletion: **Low-to-Medium Risk**
- Only affects debug-enabled runs (`NEXT_PUBLIC_DEBUG=true`)
- No impact on production (debug flag not set)
- May affect development debugging if flag is enabled
- **Impact:** Reduced debug logging when flag is enabled; no production impact

### Overall Risk: **Low**
- All deletions are either documentation or debug-only code
- No production runtime behavior changes
- No database changes
- No test changes

## E. Acceptance Criteria

1. ✅ **CI remains green** - No test failures
2. ✅ **No runtime behavior changes in production** - Debug-only paths removed
3. ✅ **No changes to DB behavior** - Migrations remain unchanged
4. ✅ **No breaking changes** - All production code paths intact

## F. Deletion Summary

**Files to Delete:**
- `AUDIT_REPORT.md`
- `AUDIT_REPORT_ITEMS_FIX.md`
- `AUDIT_REPORT_RLS_SESSION_FIX.md`
- `AUDIT_REPORT_DRAFTS_PROMOTIONS_FIX.md`

**Code Blocks to Delete:**
- `app/api/sales/route.ts`: ~3 debug blocks (lines ~1041-1058, ~1233-1249, ~1318-1337)
- `app/api/drafts/route.ts`: ~1 debug block (lines ~260-279)
- `lib/supabase/clients.ts`: ~1 debug block (lines ~38-44)

**Total Impact:**
- 4 documentation files
- ~5 debug code blocks
- ~60 lines of debug-only code
- 0 production code changes
- 0 test changes
- 0 database changes
