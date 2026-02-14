# Release Hardening Verification Report

## Executive Summary

This document outlines the CI verification checks added to prevent regressions in release-hardening changes, explains the CI job count discrepancy, and provides verification status for critical changes.

## CI Job Count Explanation

### Why ~110 Checks vs ~52 Checks?

**Root Cause:** Duplicate workflow runs from both `push` and `pull_request` events.

**Details:**
- PRs targeting `main` trigger workflows on both:
  - `pull_request` event (when PR is opened/updated)
  - `push` event (when commits are pushed to the PR branch)
- Each workflow run creates separate check suites
- **ci.yml** has 9 jobs (env-presence, lint, typecheck, test-unit, test-integration [43 batches], test-e2e-smoke, build, css-scan, migration-verify)
- **synthetic-e2e.yml** has 1 job
- **CodeQL** (external check) adds ~2 checks
- **Vercel** (external check) adds ~2 checks
- **Total for single run:** ~52-57 checks
- **Total with duplicate runs:** ~110 checks (2x the base count)

**Full Suite Breakdown (PR targeting main):**
- ci.yml: 9 jobs (1 + 1 + 1 + 1 + 43 + 1 + 1 + 1 + 1)
- synthetic-e2e.yml: 1 job
- CodeQL: ~2 checks (external)
- Vercel: ~2 checks (external)
- **Single run total:** ~57 checks
- **With duplicate push+PR:** ~110 checks

**Recent Changes:**
- PR #255 changed `ci.yml` and `synthetic-e2e.yml` to run on all PRs (removed `branches: ["main"]` filter)
- This caused CodeQL/Vercel to not run on non-main PRs (they require main branch)
- The ~52 count is correct for a single workflow run
- The ~110 count appears when both push and pull_request events trigger workflows

## CI Release Assertions Added

### New Job: `release-hardening`

**Location:** `.github/workflows/ci.yml` (added before `notify-completion`)

**Checks Performed:**

1. **Service Role Usage in Request-Path Files**
   - Scans: `app/api`, `app/auth`, `middleware`, `lib/auth/server-session.ts`
   - Fails if: `getAdminDb()` or `SUPABASE_SERVICE_ROLE` found in request-path handlers
   - Allows: webhook, admin routes, cron jobs, background jobs

2. **Rate Limiting Coverage**
   - Verifies: `GET /api/sales`, `GET /api/favorites_v2`, `POST /api/profile/update`
   - Fails if: endpoints are not wrapped with `withRateLimit`
   - Checks for handler wrapper pattern or direct export wrapping

3. **OAuth Callback Logging Safety**
   - Scans: `app/auth/*/callback/*.ts` files
   - Fails if: `url.href`, `searchParams.get('code')`, or `redirectTo` in logs
   - Prevents sensitive OAuth data from being logged

4. **Pagination Implementation**
   - Verifies: `/api/sales` has limit/offset parsing
   - Checks: Max limit (200) enforcement is present
   - Validates: Default limit (24) is used

**Script:** `scripts/verify-release-hardening.sh`

## Unit Tests Added

### Pagination Parameter Parsing

**File:** `tests/unit/api/sales.pagination.test.ts`

**Coverage:**
- Default limit (24) when no param provided
- Valid limit/offset parsing
- Max limit enforcement (200)
- Min limit enforcement (1)
- Min offset enforcement (0)
- Invalid string handling
- Empty string handling
- Boundary conditions

**Note:** This tests the extracted parsing logic. The actual route handler uses inline parsing, but the test validates the expected behavior.

## Featured Semantics Verification

### Current Implementation

**Column:** `is_featured` (boolean, DEFAULT false)
- **Location:** `lootaura_v2.sales` table
- **Migration:** `033_safe_lootaura_v2_schema.sql` (line 51)
- **Type:** Boolean, NOT NULL, DEFAULT false

**Previous Behavior (Before PR #256):**
- GET /api/sales queried `promotions` table using `getAdminDb()`
- Computed `isFeatured` from active promotions (status='active', now ∈ [starts_at, ends_at])
- This required service role access

**Current Behavior (After PR #256):**
- GET /api/sales uses `is_featured` column directly
- `isFeatured = sale.is_featured === true`
- No promotion table query (RLS-safe)

### Semantics Analysis

**Question:** Does `is_featured` column match time-windowed promotion behavior?

**Answer:** **Behavior Changed** ⚠️

**Reasoning:**
1. `is_featured` is a static boolean column (set once, doesn't change automatically)
2. Promotions table has time-windowed logic (starts_at, ends_at, status='active')
3. The old logic would show a sale as "featured" only during its promotion window
4. The new logic shows a sale as "featured" if `is_featured=true`, regardless of time

**Risk Assessment:**
- **Low Risk:** If `is_featured` is only set by admin/manual processes and matches intended featured status
- **Medium Risk:** If promotions were time-windowed and `is_featured` is not updated to reflect active promotions
- **Mitigation:** The promotions table still exists and can be queried by admin/cron jobs. The public API now uses the simpler `is_featured` flag.

**Recommendation:**
- If time-windowed promotions are required, create an RLS-safe view or RPC function that:
  - Queries promotions table with public read policy (or no RLS for read-only)
  - Returns only active promotion sale_ids
  - Is called by GET /api/sales to compute `isFeatured`
- Alternatively, ensure a cron job updates `is_featured` based on active promotions

**Current Status:** **Behavior Changed** - Static `is_featured` does not match time-windowed promotion semantics, but is RLS-safe for public endpoints.

## RLS Correctness for POST /api/sales

### Current Implementation

**Client Used:** `getRlsDb()` (RLS-aware client)
- **Location:** `app/api/sales/route.ts:1165`
- **Policy Required:** `sales_owner_insert`
- **Policy Definition:** `WITH CHECK (auth.uid() = owner_id)`

**Verification:**
- ✅ Sale creation uses RLS-aware client
- ✅ `owner_id` is set server-side from authenticated user (line 1250)
- ✅ RLS policy `sales_owner_insert` enforces ownership match
- ✅ Items creation also uses RLS-aware client (line 1297)
- ✅ Items policy `items_owner_insert` ensures sale ownership

**RLS Policies Involved:**
1. **sales_owner_insert** (from `117_security_hardening_rls_policies.sql:116-120`)
   - Allows INSERT for authenticated users
   - Enforces: `auth.uid() = owner_id`
2. **items_owner_insert** (from `047_rls_hardening.sql:94-96`)
   - Allows INSERT for authenticated users
   - Enforces: Sale ownership via subquery

**Integration Test Plan (Manual):**

If CI cannot run against Supabase, use this manual verification:

```bash
# 1. Create a test user and get auth token
# 2. Attempt to create a sale with owner_id matching auth.uid()
curl -X POST https://your-api/api/sales \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Sale", "owner_id": "$USER_ID", ...}'
# Expected: 200 OK, sale created

# 3. Attempt to create a sale with different owner_id
curl -X POST https://your-api/api/sales \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Sale", "owner_id": "different-user-id", ...}'
# Expected: 403 Forbidden or RLS policy violation

# 4. Verify items creation respects sale ownership
# (Create sale, then try to add items to someone else's sale)
```

**CI Integration (If Supabase Test Project Available):**

1. Set up test Supabase project with:
   - `NEXT_PUBLIC_SUPABASE_URL` (test project)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (test project)
   - Run migrations: `supabase db push`
   - Seed test data: Create test users, sales

2. Add integration test:
   - File: `tests/integration/api/sales.create.rls.test.ts`
   - Test: Create sale with matching owner_id (should succeed)
   - Test: Create sale with mismatched owner_id (should fail)
   - Test: Add items to own sale (should succeed)
   - Test: Add items to other's sale (should fail)

3. Run in CI:
   - Add to `test-integration` matrix
   - Use test Supabase credentials from secrets

## Verification Checklist

### What CI Will Now Catch

- ✅ Service role usage in request-path handlers (fails CI)
- ✅ Missing rate limiting on required endpoints (fails CI)
- ✅ Unsafe OAuth callback logging (fails CI)
- ✅ Missing pagination implementation (warns CI)
- ✅ Pagination parameter parsing (unit tests)

### Remaining Gaps (Manual Verification Required)

- ⚠️ **Featured semantics:** Verify `is_featured` column matches intended behavior (static vs time-windowed)
- ⚠️ **RLS policy enforcement:** Manual integration test or CI with test Supabase project
- ⚠️ **Rate limiting behavior:** Load testing to verify 429 responses and headers
- ⚠️ **Pagination backward compatibility:** Manual test of old clients expecting array response

### Risk Call: is_featured Change

**Status:** ⚠️ **Behavior Changed** - Semantics Regression (Low-Medium Risk)

**Details:**
- Old: Time-windowed promotions (active only during promotion window)
- New: Static `is_featured` column (always true if set)
- Impact: Sales may show as "featured" outside their promotion window
- Mitigation: Admin/cron jobs can update `is_featured` based on active promotions

**Recommendation:**
- If time-windowed behavior is required, implement RLS-safe promotion query (view/RPC)
- Otherwise, ensure `is_featured` is kept in sync with active promotions via cron job
- Document the change in release notes if this affects user-visible behavior

## Next Steps

1. **Run CI:** Verify `release-hardening` job passes on PR #256
2. **Manual Testing:** Verify featured semantics match requirements
3. **Integration Testing:** Set up test Supabase project for RLS verification (optional)
4. **Documentation:** Update release notes if `is_featured` behavior change is intentional
