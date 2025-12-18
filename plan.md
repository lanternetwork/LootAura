# LootAura Development Plan

**Last updated: 2025-01-31**

## Webapp Production Readiness / SLOs

## CI / Dependency Management (Lockfile)

- **Canonical package manager**: `npm`
- **Required lockfile**: `package-lock.json` at the repo root
- **CI policy**: GitHub Actions uses `npm ci` and `actions/setup-node` npm caching, which requires `package-lock.json`. Deleting or failing to commit the lockfile will cause CI to fail early.

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

The dry-run endpoint is integrated into the synthetic E2E workflow (`.github/workflows/synthetic-e2e.yml`).

**Access Methods:**
1. **CI Secret Header** (for automated tests):
   - Requires `ENABLE_DEBUG_ENDPOINTS=true` and `FEATURED_EMAIL_DRYRUN_SECRET` env var
   - Request must include header: `X-LootAura-DryRun-Secret: <secret>`
   - Does NOT require admin authentication
   - Returns fixture data (no real DB queries)

2. **Admin Authentication** (for Owner manual testing):
   - Requires admin authentication via `assertAdminOrThrow`
   - Works when `ENABLE_DEBUG_ENDPOINTS=true` OR in non-production environments
   - Returns fixture data (no real DB queries)

**CI Integration:**
- The synthetic E2E workflow sets `ENABLE_DEBUG_ENDPOINTS=true` and `FEATURED_EMAIL_DRYRUN_SECRET` from GitHub Actions secrets
- **Required GitHub Actions Secret:** `FEATURED_EMAIL_DRYRUN_SECRET`
  - Must be configured in repository secrets for synthetic-e2e workflow to pass
  - Generate using: `openssl rand -hex 32` (or similar secure random string generator)
  - Must match what the endpoint expects in CI (used in `X-LootAura-DryRun-Secret` header)
  - **CI-only secret** - should not be reused elsewhere or exposed
  - If missing, the synthetic-e2e workflow will fail with a clear error message
- The workflow validates:
  - HTTP 200 response
  - `ok: true`
  - `count === 12`
  - `selectedSales` is an array of length 12
  - All elements in `selectedSales` are non-empty strings (IDs only)

**Expected Response:**
```json
{
  "ok": true,
  "count": 12,
  "selectedSales": [
    "test-sale-1",
    "test-sale-2",
    ...
  ],
  "source": "fixture"
}
```

**Response Shape:**
- `selectedSales`: Array of sale IDs (strings only, no objects, no PII)
- No promotion status, titles, owner IDs, or location data

**Security:**
- Endpoint is disabled in production unless `ENABLE_DEBUG_ENDPOINTS=true`
- CI secret header uses constant-time comparison to prevent timing attacks
- No PII is returned (only sale IDs and promotion status)
- Secrets are never logged or exposed in error messages

**Removal Checklist (once full system is implemented):**
- [ ] Remove `/api/admin/featured-email/dry-run` route
- [ ] Remove `FEATURED_EMAIL_DRYRUN_SECRET` from GitHub Actions secrets
- [ ] Remove dry-run step from `synthetic-e2e.yml` or point to real job validation endpoint
- [ ] Remove `ENABLE_DEBUG_ENDPOINTS` requirement for this endpoint (if still needed for other debug endpoints)

---

## Milestone 2: Featured Email Data Foundations

**Status:** ✅ Completed (2025-12-15)

### Overview

Milestone 2 builds the data foundations for the Weekly Featured Sales email system, including ZIP usage tracking, email preferences, inclusion analytics, and a real selection engine. This milestone does NOT implement Stripe promotions or actual email sending yet.

### Data Model

**Migrations:**
- `119_add_featured_email_foundations.sql`: Creates `profile_zip_usage` table and adds `email_featured_weekly_enabled` column to profiles
- `120_add_featured_inclusion_tracking.sql`: Creates `featured_inclusions` (recipient-level) and `featured_inclusion_rollups` (sale-level aggregates) tables
- `121_update_profiles_v2_view_featured_preference.sql`: Updates `profiles_v2` view to include featured email preference

**Tables:**
1. **`profile_zip_usage`**: Tracks most-used ZIP codes per user
   - `profile_id`, `zip`, `use_count`, `last_seen_at`
   - Primary ZIP = highest `use_count`, tie-break by `last_seen_at` DESC
   - RLS: Self-only read/write for authenticated users

2. **`featured_inclusions`**: Recipient-level exposure tracking (fairness rotation)
   - `sale_id`, `recipient_profile_id`, `week_key`, `times_shown`, `last_shown_at`
   - Unique constraint: `(recipient_profile_id, sale_id, week_key)`
   - RLS: Deny all direct access (service_role only) - privacy protection

3. **`featured_inclusion_rollups`**: Sale-level aggregates (seller reporting)
   - `sale_id`, `unique_recipients_total`, `total_inclusions_total`, `last_featured_at`
   - RLS: Sellers can read aggregates for their own sales only

**Preferences:**
- `email_featured_weekly_enabled` (boolean, default `true`) in `profiles` table
- Integrated with existing notification preferences pattern
- Default ON for new users (opt-out model)

### Selection Engine

**Module:** `lib/featured-email/selection.ts`

**Input:**
- `recipientProfileId`: User profile ID
- `primaryZip`: Most-used ZIP code (from `profile_zip_usage`)
- `now`: Current timestamp
- `weekKey`: ISO week format (e.g., "2025-W03")
- `radiusKm`: Search radius (default: 50km)

**Output:**
- `selectedSales`: Array of exactly 12 sale IDs
- `totalPromoted`: Number of promoted sales selected
- `totalOrganic`: Number of organic (high-view) sales selected

**Selection Rules:**
1. **Window**: Next 7 days only (`date_start` within next 7 days)
2. **Exclusions**:
   - Recipient's own sales (`owner_id !== recipientProfileId`)
   - `moderation_status = 'hidden_by_admin'`
   - `archived_at IS NOT NULL`
   - `status != 'published'`
3. **Promoted Priority**:
   - If >=12 promoted nearby → all 12 selected are promoted
   - If <12 promoted nearby → includes all promoted + remaining are high-view organic
4. **Fairness Rotation**:
   - Promoted sales sorted by least-shown first (using `featured_inclusions.times_shown`)
   - Tie-break with seeded randomness (seed = `recipientProfileId + weekKey`)
5. **High-View Backfill**:
   - Organic sales sorted by view count (last 30 days from `analytics_events_v2`)
   - Tie-break with seeded randomness
6. **Deterministic Seeding**:
   - Uses `seededShuffle()` with `recipientProfileId + weekKey` as seed
   - Ensures stable results for same recipient/week combination

**Current Limitations:**
- Uses `is_featured` flag as placeholder for "promoted" (will be replaced with promotions table in future milestone)
- Location filtering (ZIP-based radius) is not yet implemented (fetches all candidates, filters in memory)
- PostGIS spatial queries will be added in future optimization

**Stabilization Notes:**
- Migration 122: Fixed `profiles_v2` view to use SECURITY INVOKER (consistent with migration 112)
- ZIP usage throttling: 24-hour minimum between increments per user per ZIP
- Dry-run endpoint: Does NOT write inclusion tracking (maintains CI compatibility, does not affect seller reporting)
- `is_featured` safety: Not settable by public endpoints (only test/admin endpoints set to `false`)

### ZIP Usage Tracking

**Module:** `lib/data/zipUsage.ts`

**Functions:**
- `incrementZipUsage(profileId, zip)`: Increments use count for a ZIP (rate-limited: max once per 24 hours per user per ZIP)
- `getPrimaryZip(profileId)`: Returns primary ZIP (highest use_count, tie-break by last_seen_at)

**Integration:**
- Hooked into `/api/geocoding/zip` endpoint (non-blocking, fire-and-forget)
- Tracks ZIP usage when authenticated users look up ZIP codes
- Privacy: No raw lat/lng history stored, only ZIP codes

### Inclusion Tracking

**Module:** `lib/featured-email/inclusionTracking.ts`

**Functions:**
- `recordInclusions(inclusions[])`: Records featured inclusions (updates both recipient-level and rollup tables)
- `getInclusionRollup(saleId)`: Returns aggregate metrics for a sale (for seller reporting)

**Privacy:**
- Recipient-level rows are NOT readable by sellers (RLS denies all direct access)
- Only service_role (backend jobs) can access recipient-level data
- Sellers can only see aggregate counts (`unique_recipients_total`, `total_inclusions_total`)

### Milestone 2 Security Checks

**RLS Policies:**
- ✅ `profile_zip_usage`: Self-only read/write for authenticated users; service_role full access; no anon access
- ✅ `featured_inclusions`: Deny all direct access (service_role only); sellers cannot read recipient-level rows
- ✅ `featured_inclusion_rollups`: Sellers can read aggregates for own sales only (via EXISTS subquery on sales.owner_id); service_role full access; no anon access

**View Security:**
- ✅ `profiles_v2` view uses SECURITY INVOKER (migration 122); RLS policies on base table apply
- ⚠️ Email preferences (`email_featured_weekly_enabled`, etc.) are exposed in view but protected by RLS (users can only read their own preferences); consistent with existing `email_favorites_digest_enabled` pattern

**Endpoint Security:**
- ✅ No endpoint response includes ZIP codes, recipient IDs, or inclusion-tracking data
- ✅ Dry-run endpoint returns only sale IDs (no PII)
- ✅ ZIP usage tracking is non-blocking (failures don't break geocoding)

**Cost Discipline:**
- ✅ ZIP usage writes throttled: at most once per 24 hours per user per ZIP
- ✅ ZIP usage tracking only for authenticated users
- ✅ Non-blocking implementation (fire-and-forget)

**Selection Engine Safety:**
- ✅ `is_featured` is not settable by any public/seller mutation endpoints (only set to `false` in test/admin endpoints)
- ✅ Selection engine uses `is_featured` as placeholder read flag only
- ✅ Dry-run endpoint does NOT write inclusion tracking (dry-run does not count toward seller reporting)

**Fairness & Inclusion Tracking:**
- ✅ Selection engine consults `featured_inclusions` to de-prioritize previously-shown items
- ✅ Inclusion tracking updates both recipient-level and rollup tables
- ✅ Unique recipients count: increments once per sale per recipient total (across all weeks)
- ✅ Total inclusions count: increments per send (sum of `times_shown`)
- ✅ Selection engine uses service_role (admin client) to read inclusion data (no public exposure)

### Dry-Run Endpoint Updates

**Endpoint:** `/api/admin/featured-email/dry-run`

**Changes:**
- Now uses real selection engine (`selectFeaturedSales`) when data is available
- Falls back to fixture mode if:
  - Selection engine returns <12 sales
  - Selection engine throws an error
  - No real data available (CI/test environments)
- Response includes `source: "real" | "fixture"` to indicate which path was used
- Maintains CI compatibility (always returns 12 IDs)

### What's Still Not Implemented

**Not Yet Implemented:**
- Stripe promotion payment processing
- Actual promotions table (using `is_featured` as placeholder)
- PostGIS spatial queries for ZIP-based radius filtering
- Full weekly email job processor (scheduled send)
- Email template for featured sales
- Geographic proximity filtering optimization
- Promotion checkout/webhook handlers

**Next Milestones:**
- Milestone 3: Weekly email job (scheduled send, email template) ✅ **COMPLETE**
- Milestone 4: Stripe promotions (payment processing, promotions table)
- Milestone 5: Performance optimization (PostGIS queries, caching)

## Milestone 3: Weekly Featured Sales Email Job

**Status:** ✅ **COMPLETE**

Milestone 3 implements the weekly featured sales email job pipeline with safety gates, recipient selection, email sending, and inclusion tracking writeback. This milestone does NOT implement Stripe promotions yet (still using `is_featured` as placeholder).

### Implementation Summary

**Cron Endpoint:**
- `/api/cron/weekly-featured-sales` (GET/POST)
- Protected by `CRON_SECRET` Bearer token authentication
- Recommended schedule: Weekly on Thursdays at 09:00 UTC

**Safety Gates:**
- `FEATURED_EMAIL_ENABLED`: Must be `"true"` to run (default: `false`)
- `FEATURED_EMAIL_SEND_MODE`: 
  - `"compute-only"` (default): Compute selections and write inclusion tracking ONLY for allowlisted recipients; if allowlist is empty, no-op
  - `"allowlist-send"`: Send emails only to allowlisted recipients
  - `"full-send"`: Send to all eligible recipients
- `FEATURED_EMAIL_ALLOWLIST`: Comma-separated emails or profile IDs (for compute-only/allowlist-send modes)

**Recipient Selection:**
- Only users with `email_featured_weekly_enabled = true` (default ON)
- Excludes fully unsubscribed users (both `email_favorites_digest_enabled` and `email_seller_weekly_enabled` are `false`)
- Must have a deliverable email address
- Must have a primary ZIP code (v1: skip if no ZIP; broader fallback can be added later)
- Does not require favorites to receive this email

**Email Template:**
- `FeaturedSalesEmail` template with 12 sale cards
- Each card includes: title, date range, address (if available), cover image (if available), "View Sale" button
- Uses unified unsubscribe footer system
- Robust to missing images

**Send Pipeline:**
- Uses existing `sendEmail` infrastructure (Resend integration)
- Non-blocking error handling (per-recipient errors don't kill the whole job)
- Returns summarized job result (counts only, no PII)
- Respects `LOOTAURA_ENABLE_EMAILS` global toggle

**Inclusion Tracking Writeback:**
- Records inclusion tracking when emails are actually sent
- Updates both `featured_inclusions` (recipient-level) and `featured_inclusion_rollups` (aggregates)
- For `compute-only` mode:
  - If allowlist is set: treats as "sent" for allowlisted recipients (records inclusions)
  - If allowlist is empty: does NOT record inclusions (no-op)
- Does NOT record inclusions for dry-run endpoint

**Job Processor:**
- `processWeeklyFeaturedSalesJob()` in `lib/jobs/processor.ts`
- Queries eligible recipients, selects 12 sales per recipient, sends emails, records inclusions
- Handles errors gracefully (continues processing other recipients on failure)

### Rollout Procedure

**Step 1: Deploy with feature disabled**
- Set `FEATURED_EMAIL_ENABLED=false` (default)
- Verify cron endpoint returns `skipped: true`
- No emails sent, no inclusions recorded

**Step 2: Enable compute-only with allowlist**
- Set `FEATURED_EMAIL_ENABLED=true`
- Set `FEATURED_EMAIL_SEND_MODE=compute-only`
- Set `FEATURED_EMAIL_ALLOWLIST=<your-email>`
- Trigger cron endpoint manually (with `CRON_SECRET`)
- Verify:
  - No emails sent (compute-only mode)
  - Inclusions recorded for allowlisted recipient
  - Selection engine returns 12 sales

**Step 3: Switch to allowlist-send**
- Set `FEATURED_EMAIL_SEND_MODE=allowlist-send`
- Keep `FEATURED_EMAIL_ALLOWLIST=<your-email>`
- Trigger cron endpoint
- Verify:
  - Email received with 12 sales
  - Unsubscribe link works
  - Inclusions recorded

**Step 4: Switch to full-send (production)**
- Set `FEATURED_EMAIL_SEND_MODE=full-send`
- Clear or remove `FEATURED_EMAIL_ALLOWLIST`
- Schedule cron job (weekly on Thursdays at 09:00 UTC)
- Monitor:
  - Email send counts
  - Error rates
  - Inclusion tracking accuracy

### Safety & Privacy

**No PII Leakage:**
- No ZIP codes, recipient IDs, or inclusion data in endpoint responses
- No PII in logs (emails, user IDs, tokens)
- Structured logging only (counts, error messages)

**Opt-Out Respect:**
- Fully unsubscribed users (both preferences `false`) are excluded
- Users with `email_featured_weekly_enabled=false` are excluded
- Unsubscribe link in email footer uses unified system

**Error Handling:**
- Per-recipient errors don't kill the whole job
- Errors are logged but don't throw
- Job returns summary (counts only)

### Testing

**Integration Tests:**
- Cron auth (missing/invalid `CRON_SECRET` returns 401)
- Safety gates (`FEATURED_EMAIL_ENABLED=false` returns skipped)
- Recipient selection (respects preferences, excludes unsubscribed, requires ZIP)
- Correctness (generates 12 sales, records inclusions)
- Opt-out behavior (excludes users with preferences disabled)

**Manual Testing:**
- Set `FEATURED_EMAIL_ENABLED=true` and `FEATURED_EMAIL_SEND_MODE=allowlist-send` in non-prod
- Add your email to `FEATURED_EMAIL_ALLOWLIST`
- Trigger cron endpoint manually (with `CRON_SECRET`)
- Verify email received with 12 sales and working unsubscribe link

### What's Still Not Implemented

**Not Yet Implemented:**
- Stripe promotion payment processing
- Actual promotions table (using `is_featured` as placeholder)
- PostGIS spatial queries for ZIP-based radius filtering (using approximate radius for now)
- Geographic proximity filtering optimization

**Next Milestones:**
- Milestone 4: Stripe promotions (payment processing, promotions table)
- Milestone 5: Performance optimization (PostGIS queries, caching)

### Milestone 2 Security Checks

**RLS Policies:**
- ✅ `profile_zip_usage`: Self-only read/write for authenticated users; service_role full access; no anon access
- ✅ `featured_inclusions`: Deny all direct access (service_role only); sellers cannot read recipient-level rows
- ✅ `featured_inclusion_rollups`: Sellers can read aggregates for own sales only (via EXISTS subquery on sales.owner_id); service_role full access; no anon access

**View Security:**
- ✅ `profiles_v2` view uses SECURITY INVOKER (migration 122); RLS policies on base table apply
- ⚠️ Email preferences (`email_featured_weekly_enabled`, etc.) are exposed in view but protected by RLS (users can only read their own preferences); consistent with existing `email_favorites_digest_enabled` pattern

**Endpoint Security:**
- ✅ No endpoint response includes ZIP codes, recipient IDs, or inclusion-tracking data
- ✅ Dry-run endpoint returns only sale IDs (no PII)
- ✅ ZIP usage tracking is non-blocking (failures don't break geocoding)

**Cost Discipline:**
- ✅ ZIP usage writes throttled: at most once per 24 hours per user per ZIP
- ✅ ZIP usage tracking only for authenticated users
- ✅ Non-blocking implementation (fire-and-forget)

**Selection Engine Safety:**
- ✅ `is_featured` is not settable by any public/seller mutation endpoints (only set to `false` in test/admin endpoints)
- ✅ Selection engine uses `is_featured` as placeholder read flag only
- ✅ Dry-run endpoint does NOT write inclusion tracking (dry-run does not count toward seller reporting)

**Fairness & Inclusion Tracking:**
- ✅ Selection engine consults `featured_inclusions` to de-prioritize previously-shown items
- ✅ Inclusion tracking updates both recipient-level and rollup tables
- ✅ Unique recipients count: increments once per sale per recipient total (across all weeks)
- ✅ Total inclusions count: increments per send (sum of `times_shown`)
- ✅ Selection engine uses service_role (admin client) to read inclusion data (no public exposure)

### Security & Privacy

**RLS Policies:**
- `profile_zip_usage`: Self-only read/write
- `featured_inclusions`: Deny all direct access (service_role only)
- `featured_inclusion_rollups`: Sellers can read aggregates for own sales only

**Data Minimization:**
- No raw lat/lng history stored (only ZIP codes)
- No PII in inclusion tracking (only sale IDs and recipient profile IDs)
- No debug logging of ZIP codes or user identifiers

**Access Control:**
- Dry-run endpoint requires admin auth OR CI secret header
- Debug endpoints disabled in production by default (`ENABLE_DEBUG_ENDPOINTS` flag)

---

**Note**: This plan is a living document and should be updated as the project evolves.

---

## Milestone 5A: Seller-Facing Promote CTAs (Promoted Listings)

**Status:** ✅ Implemented (pending rollout)

### Overview

Milestone 5A adds **seller-facing “Promote listing” CTAs** wired to the Stripe-based promotions infrastructure from Milestone 4, with strict gating and a batch status endpoint to avoid N+1 queries.

### CTA Locations

- **Sell Wizard (Promote step + Review step)**  
  - **Promote Step** (when `PROMOTIONS_ENABLED=true`):  
    - Location: Dedicated step immediately before Review in `SellWizardClient` (`app/sell/new/SellWizardClient.tsx`).  
    - Marketing page with value propositions:  
      - Featured in Weekly Emails  
      - Enhanced Discovery  
      - More Views & Engagement  
      - 7-Day Promotion  
    - Toggle: "Promote this sale" (local-only `wantsPromotion` state; **no DB writes**).  
    - Default: OFF  
  - **Review Step**:  
    - When `PROMOTIONS_ENABLED=true`, includes a subtle checkbox:  
      - Label: "Promote this sale"  
      - Microcopy: "Starts checkout after you publish."  
      - Visually secondary, does not distract from publishing  
    - State sync: Review checkbox reflects same `wantsPromotion` state as Promote step toggle  
    - Primary CTA labeling:  
      - If `wantsPromotion=false`: "Publish Sale"  
      - If `wantsPromotion=true`: "Checkout & publish"  
  - **Checkout behavior** (when "Checkout & publish" is clicked):  
    - If `PAYMENTS_ENABLED=true`:  
      - Publishes sale first, then calls `POST /api/promotions/checkout` with CSRF headers  
      - Redirects to Stripe `checkoutUrl` on success  
      - Shows friendly error messages for account-locked / ineligible / disabled cases  
    - If `PAYMENTS_ENABLED=false`:  
      - Does not call checkout  
      - Shows message: "Promotions aren't available yet."  
      - Resets `wantsPromotion` to `false` so CTA returns to "Publish Sale"  
  - When `PROMOTIONS_ENABLED=false`:  
    - Neither Promote step nor Review checkbox appears  
    - Review step remains unchanged

- **Dashboard (Seller-owned sales)**  
  - Location: Actions row on each seller-owned sale card in the dashboard (`DashboardSaleCard`).  
  - When `PROMOTIONS_ENABLED=true`, shows a **“Promote”** button next to `Edit`, wired to `POST /api/promotions/checkout` using the shared CSRF helper and structured error handling.  
  - When a promotion is active for the sale, the CTA renders as a disabled **“Promoted • Ends <date>”** pill (no extra fetches).  
  - When `PAYMENTS_ENABLED=false`, the button is disabled and labeled “Promotions unavailable”; the handler short-circuits before calling checkout.

- **Sale Detail Page (Seller view)**  
  - Location: Seller sidebar on sale detail (`SaleDetailClient`).  
  - Visible **only** when:  
    - User is authenticated **and** is the sale owner.  
    - `PROMOTIONS_ENABLED=true`.  
  - States:  
    - Active promotion: “Promoted” + “Ends <date>” (non-interactive).  
    - Inactive: “Promote this sale” card with a CTA button:  
      - `PAYMENTS_ENABLED=false` → disabled CTA + friendly message, no checkout call.  
      - `PAYMENTS_ENABLED=true` → calls `POST /api/promotions/checkout` and redirects to `checkoutUrl`, with user-friendly error handling for all guarded error codes.

### Gating & Environment Flags

- **Visibility gate (`PROMOTIONS_ENABLED`)**  
  - Server-only env flag (`PROMOTIONS_ENABLED=true`):  
    - `DashboardPage`, `SaleDetailPage`, and `SellNewPage` read the flag and pass `promotionsEnabled` into their client components.  
  - When `PROMOTIONS_ENABLED=false`:  
    - Dashboard promote buttons are hidden.  
    - Wizard’s “Feature your sale” section is not rendered.  
    - Sale detail Promote panel is not shown, even to the owner.

- **Checkout gate (`PAYMENTS_ENABLED`)**  
  - Server-only env flag (`PAYMENTS_ENABLED=true`) enforced in **two layers**:  
    1. **Global Stripe client gate**: `getStripeClient()` returns `null` when `PAYMENTS_ENABLED !== 'true'`.  
    2. **Route-level guard**: `POST /api/promotions/checkout` calls `isPaymentsEnabled()` and returns `403 PAYMENTS_DISABLED` *before* touching Stripe or the database when disabled.  
  - UI behavior when `PAYMENTS_ENABLED=false`:  
    - Dashboard CTA and Sale Detail CTA render as disabled with “Promotions unavailable” copy and never call checkout.  
    - Sell wizard confirmation modal disables “Promote now” and shows a friendly message instead of calling checkout.

### Batch Status Endpoint (No N+1)

- **Endpoint:** `GET /api/promotions/status?sale_ids=<comma-separated>`  
  - Location: `app/api/promotions/status/route.ts`.  
  - Requires `sale_ids` query param; missing/empty requests return `400 INVALID_REQUEST`.  
  - Auth required (`supabase.auth.getUser()`); non-authenticated requests return `401 AUTH_REQUIRED`.  
  - Non-admin callers only see promotions where `owner_profile_id === user.id`; admins use `assertAdminOrThrow` to bypass the owner filter.  
  - Input safety:  
    - `MAX_SALE_IDS = 100` (deduplicated; requests over the cap return `400 INVALID_REQUEST`).  
    - `MAX_SALE_IDS_PARAM_LENGTH = 4000` (rejects overly long query strings with `400 INVALID_REQUEST`).  
  - Response shape (minimal, no PII):  
    - `{ statuses: Array<{ sale_id, is_active, ends_at, tier }> }`.  
    - `is_active` is computed in-process based on `status` and `ends_at` relative to `now`.

- **Dashboard usage (no N+1):**  
  - `SalesPanel` computes the list of live sale IDs once per render and issues a single `fetch('/api/promotions/status?sale_ids=…')`.  
  - A `promotionStatuses` map is built from the response and passed into each `DashboardSaleCard`.  
  - Tests assert that the status endpoint is called **once per panel load** and that cards do not perform per-card fetches.

### Rollout Checklist (Promote CTAs)

1. **Deploy with promotions disabled**  
   - Set `PROMOTIONS_ENABLED=false` and `PAYMENTS_ENABLED=false`.  
   - Verify that:  
     - Dashboard, Sell Wizard, and Sale Detail show **no** promotion CTAs.  
     - `/api/promotions/status` returns `401 AUTH_REQUIRED` for unauthenticated calls and `200` with `statuses: []` when none of the requested sales have promotions.

2. **Enable promotions UI only**  
   - Set `PROMOTIONS_ENABLED=true`, keep `PAYMENTS_ENABLED=false`.  
   - Verify:  
     - CTAs render in all three locations but are disabled and show “Promotions unavailable” copy.  
     - `POST /api/promotions/checkout` returns `403 PAYMENTS_DISABLED` and **never instantiates Stripe** (enforced and tested via `payments-guard`).

3. **Enable full checkout flow in staging**  
   - Set `PAYMENTS_ENABLED=true` and configure Stripe secrets + `STRIPE_PRICE_ID_FEATURED_WEEK` for staging.  
   - Manually test:  
     - Dashboard → Promote.  
     - Sell Wizard → “Feature your sale” toggle + “Promote now” path from the confirmation modal.  
     - Sale Detail → seller Promote panel.  
   - Confirm that webhooks activate/cancel/refund promotions correctly and that no PII is logged.

4. **Production rollout**  
   - Gradually enable `PROMOTIONS_ENABLED` and `PAYMENTS_ENABLED` in production once CI and staging validation are green.  
   - Monitor:  
     - CI tests (including payments-guard + CTA gating + batch-status tests).  
     - Stripe dashboard for checkout/session anomalies.  
     - Application logs for promotion-related errors (without PII).

---

## Draft Deduplication System

**Status:** ✅ Implemented

### Overview

The draft deduplication system prevents unnecessary database writes when draft content hasn't changed. This eliminates draft spam, reduces database load, and ensures deterministic behavior for "Continue draft" and autosave operations.

### Implementation

**Content Hash:**
- **Column:** `sale_drafts.content_hash` (TEXT, indexed)
- **Computation:** SHA-256 hash of canonicalized draft payload (excludes meta fields like `currentStep`)
- **Canonicalization:**
  - Excludes `currentStep` (UI state, not content)
  - Normalizes empty strings to undefined
  - Sorts arrays (tags, photos, items) for consistent ordering
  - Sorts items by name+category for stable comparison
  - Removes item IDs from hash (temporary IDs don't represent content changes)

**Server-Side Deduplication (Primary Guard):**
- **Location:** `POST /api/drafts` (`app/api/drafts/route.ts`)
- **Behavior:**
  - Computes content hash of incoming payload
  - Checks existing draft's `content_hash` if draft exists
  - If hash matches: returns `200 OK` with `{ id, deduped: true }` **without updating database**
  - If hash differs or no draft exists: proceeds with normal create/update
- **Security:** RLS intact; deduplication only applies to user's own drafts

**Client-Side Deduplication (Secondary Guard):**
- **Location:** `SellWizardClient` (`app/sell/new/SellWizardClient.tsx`)
- **Behavior:**
  - Tracks `lastSavedContentHashRef` to memoize last saved hash
  - Autosave effect skips server save if current hash matches last saved hash
  - Resume flow sets hash immediately to prevent immediate no-op save
  - Step navigation and beforeunload saves also check hash before sending

**Continue Draft Flow:**
- **Behavior:**
  - Sets `isResumingRef` flag during restore to prevent autosave
  - Computes and stores content hash of restored draft
  - Clears resume flag after 2s delay to allow state to settle
  - If restoring local draft to server, allows server-side deduplication to handle it

### What Counts as "Meaningful Change"

**Included in hash (triggers update):**
- Form data fields (title, description, address, city, state, zip, lat/lng, dates, times, tags, pricing_mode)
- Photos array (URLs, order)
- Items array (name, price, description, image_url, category - but NOT item IDs)

**Excluded from hash (does NOT trigger update):**
- `currentStep` (UI state only)
- Item IDs (temporary identifiers, not content)

### Expected Behavior

**Continue Draft:**
- Clicking "Continue draft" repeatedly without editing: **ONE draft** in database (no duplicates)
- Making one small edit and moving steps: **same draft updates** (no new draft row)

**No-Op Saves:**
- Saving identical payload twice: **first save creates/updates, second save returns `deduped: true`**
- `updated_at` timestamp **not changed** on deduped saves
- No database write occurs for deduped saves

**Change Detection:**
- Changing any form field, photo, or item: **hash changes, update occurs**
- Changing only `currentStep`: **hash unchanged, no update**
- Reordering items: **hash unchanged** (items sorted by name for consistency)

### Database Schema

**Migration:** `125_add_draft_content_hash.sql`
- Adds `content_hash TEXT` column to `sale_drafts`
- Creates index: `(user_id, draft_key, content_hash)` WHERE `status = 'active'`
- Column comment explains purpose and canonicalization rules

### Tests

**Integration Tests:** `tests/integration/drafts.deduplication.test.ts`
- ✅ Server-side deduplication (skip update when hash matches)
- ✅ Update when hash differs
- ✅ Create new draft when no existing draft
- ✅ `currentStep` changes don't affect hash
- ✅ Meaningful field changes do affect hash
- ✅ Item reordering handled consistently

### Performance & Cost Discipline

- **Zero writes** for step navigation without edits
- **Zero writes** for "Continue draft" without edits
- **Reduced DB load** in common path (autosave, step transitions)
- **Single read + conditional update** pattern (no extra round-trips)

### Security

- **RLS intact:** Deduplication only applies to user's own drafts
- **No service-role bypass:** Uses existing RLS client for reads, admin client for writes (same pattern as before)
- **No new tables:** Single column addition to existing `sale_drafts` table

---

## Favorites Visibility

**Status:** ✅ Implemented

### Overview

Favorites now reuse the same visibility rules as the main sales feed so that archived, ended, and admin-hidden sales never appear in the favorites list.

### Implementation

- **Shared helpers:** `lib/shared/salesVisibility.ts`
  - `getAnyFutureWindow` computes the "any time in the future" window (today at 00:00 UTC, no upper bound).
  - `isSaleWithinDateWindow` mirrors `/api/sales` date-window semantics.
  - `isSalePubliclyVisible` applies status, archived, moderation, and date-window checks.
- **API:** `GET /api/favorites` (`app/api/favorites/route.ts`)
  - Reads from `favorites_v2` joined with `sales_v2` via `select('sale_id, sales_v2(*)')`.
  - Applies `isSalePubliclyVisible` with `getAnyFutureWindow()` to filter out:
    - Archived sales (`archived_at` set).
    - Admin-hidden sales (`moderation_status = 'hidden_by_admin'`).
    - Fully-ended sales (end date/time strictly before today’s window).
  - Returns a normalized payload: `{ ok: true, sales, count }`.
- **Client hook:** `useFavorites` (`lib/hooks/useAuth.ts`)
  - Calls `/api/favorites` and returns the `sales` array directly.
  - No client-side reimplementation of visibility rules; the server is the single source of truth.

### Behavior

- Favorites page (`/favorites`) now:
  - Only shows sales that would also appear in the main sales feed.
  - Uses the same filtered array for:
    - The count label (`X saved sales`).
    - The rendered list (`<SalesList sales={favorites} />`).
- Known repro (favorite created for a sale that ended on 11/23) is resolved:
  - The ended sale is filtered out by `isSalePubliclyVisible`.
  - The saved count reflects only currently visible favorites.

### Tests

- `tests/integration/api/favorites.visibility.test.ts`
  - Seeds favorites joined to two sales:
    - One fully in the past (ended).
    - One active in the far future.
  - Asserts that `GET /api/favorites`:
    - Returns only the future/active sale in `sales`.
    - Reports `count === 1` (matches visible list).
