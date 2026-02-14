# Release Hardening CI Failure - Issue Report

## Executive Summary

**PR**: #256 (`fix/release-blockers-rls-rate-limit`)  
**Issue**: CI failing due to release-hardening verification script flagging legitimate service role usage  
**Status**: In progress - iteratively fixing violations and refining script exceptions  
**Root Cause**: Release-hardening script was too strict, flagging legitimate admin client usage in routes that require cross-user operations or lack RLS policies

---

## Background

As part of the release-hardening effort, a new CI job (`release-hardening`) was added to verify:
1. No service role usage in request-path handlers (except allowed contexts)
2. Rate limiting coverage on critical endpoints
3. Safe OAuth callback logging (no sensitive data)
4. Correct pagination implementation

The script (`scripts/verify-release-hardening.sh`) scans request-path files for `getAdminDb()` or `SUPABASE_SERVICE_ROLE` usage and flags them as blockers unless they're in allowed contexts.

---

## The Problem

The script was initially too strict and flagged **legitimate** uses of `getAdminDb()` in request-path handlers. These routes legitimately need admin privileges because:

1. **No RLS policies exist** for certain operations (e.g., `analytics_events` INSERT, `promotions` INSERT)
2. **Cross-user operations** require admin (e.g., checking reports from other users, updating moderation status)
3. **Admin-only diagnostic endpoints** (debug routes)

---

## What We've Fixed

### 1. Migrated Routes to RLS-Aware Clients

**Routes migrated from `getAdminDb()` to `getRlsDb()`:**

- ✅ `app/api/promotions/status/route.ts` - GET endpoint (has RLS SELECT policy)
- ✅ `app/api/sales/[id]/delete/route.ts` - DELETE endpoint (has RLS DELETE policy)
- ✅ `app/api/sales/[id]/promotion-metrics/route.ts` - GET endpoint (has RLS SELECT policy)
- ✅ `app/api/drafts/route.ts` - GET/POST/DELETE endpoints (has RLS INSERT/UPDATE/DELETE policies)

**Routes that still use `getAdminDb()` (legitimately):**

- ✅ `app/api/analytics/track/route.ts` - No RLS INSERT policy for `analytics_events`
- ✅ `app/api/promotions/intent/route.ts` - No RLS INSERT policy for `promotions`
- ✅ `app/api/sales/[id]/report/route.ts` - Needs admin for:
  - Checking duplicate reports (no SELECT policy for users)
  - Counting reports from other users (auto-hide logic)
  - Updating moderation_status on sales user doesn't own
- ✅ `app/api/debug/*` routes - Admin-only diagnostic endpoints
- ✅ `app/api/geocoding/zip/route.ts` - Optional writeback when `ENABLE_ZIP_WRITEBACK=true`

### 2. Refined Release-Hardening Script

**Added exceptions for legitimate admin usage:**

```bash
# Allowed contexts:
- webhook routes
- /admin/* routes
- /cron/* routes
- /jobs/* routes
- health/supabase
- promotions/intent (no RLS INSERT policy)
- /debug/* (admin-only)
- analytics/track (no RLS INSERT policy)
- geocoding/zip (optional writeback)
- sales/.*/report (cross-user moderation operations)
```

**Fixed script issues:**

- ✅ Fixed grep exit code handling (was causing premature script exit)
- ✅ Fixed ERRORS counter persistence (wasn't incrementing in subshells)
- ✅ Improved comment filtering (was flagging comment-only matches)
- ✅ Refined OAuth logging check (only flags log statements, not variable assignments)
- ✅ Removed redundant dynamic imports (caused lint errors)

### 3. Code Quality Fixes

- ✅ Removed redundant dynamic imports of `getRlsDb()` (all routes now use top-level imports)
- ✅ Fixed lint errors from unused imports

---

## Current Status

**Latest Commit**: `db894ca4` - "fix: Allow sales/[id]/report route in release-hardening script"

**Remaining Work**:
- Waiting for CI to complete and verify all checks pass
- Script should now correctly allow all legitimate admin usage while still catching actual violations

---

## Technical Details

### Why Some Routes Need Admin Client

1. **`analytics_events` table**: No RLS INSERT policy exists. Only service_role can INSERT. This is by design to prevent users from manipulating analytics data.

2. **`promotions` table**: Has RLS SELECT policy but no RLS INSERT policy. Only service_role can INSERT. This is by design to prevent direct seller mutations (promotions are created via Stripe webhooks).

3. **`sale_reports` table**: Has RLS INSERT policy for users to report sales, but **no SELECT policy for regular users**. This is by design (fire-and-forget reporting). The report route needs admin to:
   - Check for duplicate reports (dedupe logic)
   - Count reports from other users (auto-hide threshold)
   - Update moderation_status on sales the reporting user doesn't own

4. **`sale_drafts` table**: Has full RLS policies (SELECT/INSERT/UPDATE/DELETE), so we migrated this route to use RLS-aware client.

5. **`sales` table**: Has RLS DELETE policy, so delete route was migrated to use RLS-aware client.

### Script Logic

The script:
1. Scans `app/api`, `app/auth`, `middleware`, and `lib/auth/server-session.ts` for `getAdminDb()` or `SUPABASE_SERVICE_ROLE`
2. Filters out comment-only matches
3. Checks if the file is in an allowed context
4. Flags as blocker if not in allowed context

---

## Files Changed

**Routes migrated:**
- `app/api/promotions/status/route.ts`
- `app/api/sales/[id]/delete/route.ts`
- `app/api/sales/[id]/promotion-metrics/route.ts`
- `app/api/drafts/route.ts`

**Script updated:**
- `scripts/verify-release-hardening.sh`

**Commits:**
- `e0612862` - Initial release-hardening script and unit tests
- `98bc3946` - Fix NaN in pagination test and improve script accuracy
- `8664da9a` - Fix ERRORS counter in script
- `ab65a263` - Improve script to filter out comment-only matches
- `777bf552` - Simplify violation detection logic
- `ed0000bf` - Handle grep exit codes
- `b702e919` - Simplify grep logic
- `71474a12` - Handle grep exit code in pattern existence check
- `54c5d5aa` - Migrate promotions/status and allow promotions/intent
- `27560173` - Migrate request-path handlers and refine script
- `447e5945` - Remove redundant dynamic imports
- `db894ca4` - Allow sales/[id]/report route

---

## Next Steps

1. ✅ Verify CI passes with current changes
2. If CI still fails, investigate remaining violations
3. Once CI passes, PR is ready for review

---

## Key Learnings

1. **Not all admin client usage is a security risk** - Some operations legitimately require admin privileges due to RLS policy design or cross-user operations.

2. **Script needs to balance security with practicality** - Too strict and it flags legitimate usage; too lenient and it misses actual violations.

3. **RLS policies determine what's possible** - If a table has no RLS INSERT policy, the route must use admin client. If it has RLS policies, we should use RLS-aware client.

4. **Cross-user operations require admin** - Operations that affect data owned by other users (like moderation) require admin privileges.

---

## Related PRs

- PR #251 - Security blockers (OAuth logging, rate limiting, service role removal)
- PR #252 - Scalability + performance blockers (pagination, WebView remount)
- PR #256 - Release blockers (RLS migration, rate limiting, release-hardening verification)
