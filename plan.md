# LootAura Development Plan

**Last updated: 2025-01-31**

## Webapp Production Readiness / SLOs

### Service Level Objectives (SLOs)

#### Map Performance
- **Map Initial Interactive State**: Map + basic sales results should be interactive within ~2.5–3s on a mid-tier device (e.g., iPhone 12, mid-range Android), under normal network conditions (4G/LTE).
- **Map Pan Performance**: Map panning should maintain smooth 60fps with up to 200 visible pins; clustering should activate automatically to maintain performance.

#### Sales Query Performance
- **Core Sales Visibility Query**: Bbox-based sales queries should have p95 latency ≤ ~300ms from the database where feasible; slow paths (e.g., category filtering with large result sets) should be documented and optimized.
- **Sales Count Query**: `/api/sales/count` should respond within ~200ms p95 for typical queries (bbox < 5° span, no complex filters).

#### API Reliability
- **Error Rate**: Core API endpoints (`/api/sales`, `/api/sales/markers`, `/api/sales/count`) should maintain < 1% error rate (5xx responses) under normal load.
- **Rate Limiting**: Rate limit policies should prevent abuse while allowing normal usage patterns (e.g., map panning, filter changes).

### Release Gates

#### Pre-Production Checklist

**Error Handling & Observability:**
- ✅ No uncaught errors in normal flows (map search, sale detail, favorite/unfavorite, auth, profile) as seen in browser console.
- ✅ All API routes have top-level error handling with structured error responses.
- ✅ Central logger (`lib/log.ts`) is used consistently in server/API code; minimal `console.*` usage in production paths.
- ✅ Sentry integration is active and capturing errors from client, server, and edge runtimes.

**Cron & Background Jobs:**
- ✅ No failing cron runs in the last 7 days (based on logs/Sentry).
- ✅ Cron endpoints return structured responses with execution metadata.
- ✅ Email sending is non-blocking and error-tolerant (does not throw, returns result).

**Database & Security:**
- ✅ Supabase Security Advisor: all app-fixable lints resolved; only Supabase-managed infra items (e.g., PostGIS in `public`, `spatial_ref_sys` RLS) may remain.
- ✅ All `public.*_v2` views are `SECURITY INVOKER` (enforced via `093_supabase_security_lints_fix.sql`).
- ✅ All functions have fixed `search_path` (enforced via `094_function_search_path_hardening.sql`).
- ✅ RLS is enabled on all `lootaura_v2` tables with appropriate policies.

**Performance & Abuse Protection:**
- ✅ Rate limiting is applied to all sales/search endpoints (`/api/sales`, `/api/sales/markers`, `/api/sales/count`, `/api/sales/search`).
- ✅ Bbox size validation is enforced (max 10° span) to prevent abuse.
- ✅ Search parameter validation is in place (distance caps, query length limits, limit caps).

**Monitoring:**
- ✅ No new untriaged Sentry error groups from core flows in the last 7 days.
- ✅ Production logs do not contain PII (emails, full user IDs, tokens) in clear text.
- ✅ Structured logging is used for operational signals (component, operation, context).

### Performance Benchmarks

**Target Metrics (aspirational, to be validated in production):**
- Map first paint: < 2.5s (p95)
- Sales query latency: < 300ms (p95) for bbox queries
- Sales count query: < 200ms (p95)
- API error rate: < 1% (5xx responses)

**Note**: These benchmarks are based on typical usage patterns and should be validated against real production traffic. Adjust thresholds based on observed performance.

---

## Development Roadmap

### Current Focus
- Production hardening (error handling, logging, rate limiting, bbox validation)
- Security lint resolution (Supabase Security Advisor)
- Performance optimization (query latency, map rendering)

### Future Enhancements
- Advanced search filters
- User notifications
- Seller analytics dashboard
- Mobile app improvements

---

## Bugfixes

### Items Missing on Sale Detail Pages (2025-12-12, Fixed 2025-12-13)

**Issue:** Items were not appearing on sale detail pages for anonymous users, even though items existed in the database and sales were published and visible.

**Root Cause:** The `items_public_read` RLS policy used an EXISTS subquery that checked `lootaura_v2.sales` for sale visibility. This nested RLS check was failing for anonymous users because the EXISTS subquery itself was subject to RLS on the sales table, creating a circular dependency.

**Fix (Migration 115):**
- Created `lootaura_v2.is_sale_publicly_visible()` SECURITY DEFINER function that matches `sales_public_read` policy exactly:
  - `status = 'published'` only (matches current `sales_public_read` policy)
  - Does NOT check `moderation_status` or `archived_at` (these are not in `sales_public_read`)
- Updated `items_public_read` policy to use the function, eliminating the nested RLS issue
- Removed debug logging from `lib/data/salesAccess.ts` (`[ITEMS_DIAG]` console.error calls)
- Added regression test (`tests/integration/items.public-visibility.test.ts`) that verifies:
  - Items are returned for published sales to anonymous users
  - Items are NOT returned for sales with status != 'published' (e.g., 'active', 'draft')

**Known Drift (Follow-up):**
- The `sales_public_read` policy only checks `status = 'published'`, but the app code (page component) blocks sales with `moderation_status = 'hidden_by_admin'` for non-admins.
- The function matches the policy exactly (only checks status), so items WILL be returned for published sales even if `moderation_status = 'hidden_by_admin'`.
- The page component (`app/sales/[id]/page.tsx`) handles blocking hidden sales, so this is acceptable for now.
- If `sales_public_read` is updated to include `moderation_status` checks in the future, the function must be updated in a separate migration to match.
  - Items are returned for active sales

**Security:** The SECURITY DEFINER function has fixed `search_path` (`pg_catalog, public, lootaura_v2`) and returns only boolean values, preventing data leakage. The function is owned by `postgres` (migration runner) and safely bypasses RLS for the visibility check.

**Anon Profiles Access (Migration 118):** Revoked anon SELECT on `lootaura_v2.profiles` base table to reduce exposure of sensitive fields (lock fields, email prefs) to anonymous users. Public profile reads use `profiles_v2` view only (no base table fallbacks). Authenticated users retain SELECT/UPDATE permissions on base table for account lock checks and profile updates.

### Debug Endpoints

**Admin-Only Debug Routes:**
- `/api/debug/items` - Diagnostic endpoint to check if items exist for a sale (exposes owner_id, moderation_status). Protected by:
  - Admin authentication (`assertAdminOrThrow`)
  - Production environment check (disabled by default, can enable with `ENABLE_DEBUG_ENDPOINTS=true`)
- `/api/debug/db` - Database connection diagnostic endpoint. Protected by:
  - Admin authentication (`assertAdminOrThrow`)
  - Production environment check (disabled by default, can enable with `ENABLE_DEBUG_ENDPOINTS=true`)

**Removal Plan:** These endpoints were created for troubleshooting items visibility issues. They should be removed once the RLS fix (migration 114) is verified stable in production. To remove: delete `app/api/debug/items/route.ts` and `app/api/debug/db/route.ts`.

---

## P0 Moderation + Archive Test Suite

**Status:** ✅ Completed (2025-12-10)

## P0.1 Moderation + Archive Test Suite Stabilization

**Status:** ✅ Completed (2025-01-31)

### Stabilization Changes

**Deterministic Timestamps:**
- Replaced all `Date.now()` calls with deterministic base timestamp (2025-01-15 12:00:00 UTC)
- Updated `archive.cron.test.ts` to use fixed base date for all date calculations
- Ensured auto-hide threshold tests use deterministic user IDs for test isolation

**Test Isolation:**
- Verified all tests properly reset mocks in `beforeEach` hooks
- Ensured account lock tests don't leak locked/unlocked state between tests
- Standardized test user IDs to prevent cross-test contamination

**Production Codepath Alignment:**
- Verified all tests call actual route handlers (POST, GET, PATCH) matching production
- Confirmed hidden sales visibility tests use same query patterns as production
- Verified archive cron tests match production date calculation logic

**Recent Stabilization Notes (2025-12-11):**
- Account lock checks on sales/profile now fail closed with explicit `account_locked` detail messages; hidden sales search path fixed by removing duplicate Supabase client instantiation and aligning mocks to the `.order().limit()` chain.
- Simplified `/api/sales/search` to remove test-only fallback code paths; fixed Supabase mock chain for hidden-sales integration test to properly support chaining and awaitable behavior. Removed account lock checks from GET handlers (read-only operations should not be blocked).

**Admin Tools UX + Tests (2025-01-31):**
- Enhanced Admin Reports Panel with search, moderation status filter, summary counts, badges, and quick actions (hide/unhide sale, lock/unlock account).
- Enhanced Admin Users Panel with lock status filter, better lock info display (reason, timestamp), and lock reason input when locking accounts.
- Updated `/api/admin/reports` to include sale `moderation_status` and owner lock status in response.
- Added `locked` query parameter to `/api/admin/users` for server-side filtering.
- Added integration tests for new query params and enriched report responses (`tests/integration/moderation.admin-actions.test.ts`, `tests/integration/admin.users.test.ts`).

**Code Quality:**
- Removed all debug logging (no `console.log/debug/warn/error` found)
- Verified no PII in test assertions or error messages
- Confirmed tests only assert on public-facing error codes and messages

**RLS & Security:**
- Verified tests use mocked Supabase clients (no direct DB bypass)
- Confirmed tests exercise production RLS-aware code paths
- Ensured test mocks simulate correct RLS behavior

### Test Files Stabilized

- `tests/integration/moderation.report-sale.test.ts`
- `tests/integration/moderation.admin-actions.test.ts`
- `tests/integration/moderation.account-lock-enforcement.test.ts`
- `tests/integration/moderation.hidden-sales-visibility.test.ts`
- `tests/integration/archive.cron.test.ts`

### Coverage Added

**Moderation System Tests:**
- ✅ Sale reporting (`tests/integration/moderation.report-sale.test.ts`)
  - Report creation and validation
  - Duplicate report prevention (24h window)
  - Auto-hide threshold (5 unique reporters)
  - CSRF enforcement
  - Rate limiting

- ✅ Admin report actions (`tests/integration/moderation.admin-actions.test.ts`)
  - Admin can list reports
  - Admin can resolve reports and hide sales
  - Admin can lock accounts via report actions

- ✅ Hidden sales visibility (`tests/integration/moderation.hidden-sales-visibility.test.ts`)
  - Hidden sales excluded from `/api/sales`
  - Hidden sales excluded from `/api/sales/markers`
  - Hidden sales excluded from `/api/sales/search`
  - Sale detail data access behavior

- ✅ Account lock enforcement (`tests/integration/moderation.account-lock-enforcement.test.ts`)
  - Locked users cannot create sales
  - Locked users cannot create/update items
  - Locked users cannot update profile/preferences
  - Locked users cannot favorite or rate
  - Locked users retain read-only access

**Archive System Tests:**
- ✅ Archive cron behavior (`tests/integration/archive.cron.test.ts`)
  - Archive cron authentication
  - Sales ended yesterday are archived
  - Single-day sales that started in past are archived
  - Sales ending tomorrow are not archived
  - Already archived sales are not re-archived
  - 1-year retention window semantics documented

### Remaining Gaps (P1)

**Moderation:**
- No direct test for admin user management endpoints (`/api/admin/users`, `/api/admin/users/[id]/lock`)
- No test for moderation daily digest email
- No test for account lock banner UI component
- Account lock enforcement hardened on write endpoints (sales, profile) to fail closed with consistent 403 `account_locked` responses; `/api/sales/search` mocks/handler aligned to avoid 500s in hidden sales visibility path

**Archive:**
- No direct test for dashboard archive tab UI behavior
- No test for archive filter logic in `getUserSales` (tested indirectly through API)

**General:**
- E2E tests not in CI pipeline (only synthetic E2E via curl)
- Some edge cases in moderation flow (e.g., concurrent reports, race conditions)

---

## P1 Daily Cron + Email Preference Tests

**Status:** ✅ Completed (2025-01-31)

### Coverage Added

**Daily Cron Orchestration Tests:**
- ✅ Daily cron endpoint (`tests/integration/cron.daily.test.ts`)
  - Cron authentication enforcement
  - Task orchestration (archive sales, favorites digest, moderation digest)
  - Partial failure behavior (one task fails, others continue)
  - Email enablement check (skips favorites when emails disabled)
  - Overall success determination (at least one task must succeed)

**Email Job Preferences Tests:**
- ✅ Email preferences and unsubscribe (`tests/integration/email.preferences-jobs.test.ts`)
  - Favorites digest respects `email_favorites_digest_enabled` preference
  - Favorites digest skips users with preferences disabled
  - Favorites digest skips unsubscribed users (preferences set to false)
  - Seller weekly analytics respects `email_seller_weekly_enabled` preference
  - Seller weekly analytics skips sellers with preferences disabled
  - Seller weekly analytics skips unsubscribed sellers (preferences set to false)

**Moderation Daily Digest Tests:**
- ✅ Moderation digest cron (`tests/integration/cron.moderation-daily-digest.test.ts`)
  - Cron authentication enforcement
  - Digest includes only reports from last 24 hours
  - Sends empty digest when no reports
  - Sends to moderation inbox (not affected by user preferences)
  - Includes only template-permitted fields (no extra PII)
  - Handles missing sale data gracefully
  - Error handling for query failures and email send failures

### Test Patterns

- Uses deterministic timestamps (2025-01-15 12:00:00 UTC base)
- Mocks Supabase clients and email sending (no external service calls)
- Verifies job processors are called with correct parameters
- Tests preference filtering matches production behavior
- Ensures unsubscribe state (preferences = false) is respected

### Remaining Gaps (P2)

**Cron & Email:**
- No direct test for seller weekly analytics cron endpoint (`/api/cron/seller-weekly-analytics`)
- No direct test for favorites starting soon cron endpoint (`/api/cron/favorites-starting-soon`)
- No test for email deduplication logic (`canSendEmail` behavior)
- No test for unsubscribe token expiration handling in jobs

**General:**
- E2E tests not in CI pipeline (only synthetic E2E via curl)
- Some edge cases in moderation flow (e.g., concurrent reports, race conditions)

### Test Execution

All tests can be run with:
```bash
npm run test -- tests/integration/moderation.*
npm run test -- tests/integration/archive.cron.test.ts
npm run test -- tests/integration/cron.daily.test.ts
npm run test -- tests/integration/email.preferences-jobs.test.ts
npm run test -- tests/integration/cron.moderation-daily-digest.test.ts
```

Full integration test suite:
```bash
npm run test -- tests/integration/
```

---

## Playwright Smoke Suite in CI

**Status:** ✅ Completed (2025-01-31)

### Overview

A small, fast, deterministic Playwright smoke suite has been added to CI to validate critical end-to-end flows on every PR. The suite runs after integration tests and blocks merges if any test fails.

### Coverage

The smoke suite (`tests/e2e/smoke.spec.ts`) covers 4 critical flows:

1. **Public baseline**: Home page loads and map area renders (even if markers are minimal/mocked)
2. **Auth basic flow**: Sign in using mocked auth, verify redirect to dashboard/main post-login page
3. **Create sale happy path**: Navigate to sell wizard, fill minimal valid fields, publish sale, verify success
4. **Moderation smoke**: Report an existing sale as a normal user, then verify admin can see the report listed as "Open" in admin reports UI

### Configuration

**Playwright Config:**
- Smoke tests are tagged with `@smoke` annotation
- A dedicated `smoke` project is configured in `playwright.config.ts`:
  - Runs only Chromium (fastest, most stable)
  - Uses `grep: /@smoke/` to filter tests
  - Timeout: 60 seconds per test
  - Retries: 1 in CI, 0 locally

**CI Integration:**
- Job name: `test-e2e-smoke`
- Runs after: `test-integration` and `build`
- Command: `npx playwright test --project=smoke`
- Blocks merges: Yes (required check, no `continue-on-error`)

### Running Locally

To run the smoke suite locally:

```bash
# Run smoke tests only
npx playwright test --project=smoke

# Or using grep
npx playwright test --grep @smoke
```

The smoke suite uses existing Playwright mocks and helpers:
- Auth routes are mocked to avoid real email delivery
- Geocoding/Mapbox calls are mocked to avoid external service dependencies
- API routes are mocked to ensure deterministic behavior

### Design Principles

- **Fast**: Target runtime < 60-90 seconds total
- **Deterministic**: All external services (Mapbox, Resend, geocoding) are mocked
- **Stable**: Uses robust selectors and explicit waits, avoids fragile timing assumptions
- **Isolated**: Each test is independent and can run in any order

---

## CI Starter Harness for Featured Email + Promotions

**Status:** ✅ Completed (2025-01-31)

### Overview

A minimal CI "starter harness" for the Promoted Listings + Weekly Featured Email system has been added to lock in selection/eligibility promises and safety guards before implementing the full feature set.

### Coverage

**Featured Selection Logic Tests (`tests/integration/featured-email/selection.test.ts`):**
- ✅ Returns exactly 12 sales when enough candidates exist
- ✅ Excludes recipient-owned sales
- ✅ Excludes `hidden_by_admin` and archived sales
- ✅ Respects next-7-days window
- ✅ Promoted priority rules:
  - If >=12 promoted nearby → all 12 selected are promoted
  - If <12 promoted nearby → includes all promoted + remaining are top "high-view" organic candidates
- ✅ Deterministic selection using seeded randomness (recipient_id + week key)

**Promoted Inclusion Tracking Contract Test (`tests/integration/featured-email/inclusion-tracking.test.ts`):**
- ✅ Does not double-count unique recipients for the same promotion
- ✅ Increments total inclusions appropriately
- ✅ Handles multiple promotions and different weeks correctly

**Payments Disabled Safety Guard (`tests/integration/featured-email/payments-guard.test.ts`):**
- ✅ Blocks checkout creation when `PAYMENTS_ENABLED` is not set or false
- ✅ Allows checkout only when `PAYMENTS_ENABLED=true`
- ✅ Ensures no Stripe calls occur when payments are disabled

**Dry-Run Endpoint (`/api/admin/featured-email/dry-run`):**
- ✅ Admin-only endpoint for synthetic E2E smoke checks
- ✅ Returns exactly 12 sales IDs (deterministic fixture data)
- ✅ Does NOT send email
- ✅ Does NOT require Stripe
- ✅ Protected by `ENABLE_DEBUG_ENDPOINTS` flag (disabled by default in production)

### Test Patterns

- Uses deterministic timestamps (Thursday 2025-01-16 09:00:00 UTC base)
- Seeded randomness for stable test results (recipient_id + week key)
- Contract tests validate interfaces before full implementation
- Safety guards ensure no accidental charges

### What It Does NOT Yet Cover

**Not Yet Implemented:**
- Actual selection algorithm implementation (tests define contract only)
- Actual inclusion tracking database tables/logic (contract test only)
- Actual Stripe checkout session creation (guard test only)
- Full weekly email job processor
- Email template for featured sales
- Geographic proximity filtering (nearby sales)
- View analytics aggregation for organic selection
- Promotion payment processing

**Removal/Transition Plan:**
- The dry-run endpoint (`/api/admin/featured-email/dry-run`) is temporary and should be removed or disabled once the full featured email system is implemented and tested.
- Contract tests will be updated to use actual implementations once they are built.

### Test Execution

Run the starter harness tests:
```bash
npm run test -- tests/integration/featured-email/
```

### Synthetic E2E Smoke Check

The dry-run endpoint can be used in CI synthetic E2E checks:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://your-domain.com/api/admin/featured-email/dry-run?recipientId=test-recipient-1"
```

Expected response:
```json
{
  "ok": true,
  "recipientId": "test-recipient-1",
  "selectedSales": [
    { "id": "test-sale-1", "isPromoted": true },
    ...
  ],
  "count": 12
}
```

---

**Note**: This plan is a living document and should be updated as the project evolves.

