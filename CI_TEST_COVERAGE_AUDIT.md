# CI & Test Coverage Audit

**Generated:** 2025-12-10  
**Project:** LootAura – Next.js 14 App Router + Supabase  
**Status:** CI is green, but recent moderation system changes need coverage verification

---

## CI Workflows

### 1. `ci.yml` (Primary CI Pipeline)

**Triggers:**
- Pull requests targeting `main`
- Pushes to any branch except `main`
- Manual workflow dispatch

**Jobs:**

1. **env-presence** (validation)
   - Checks for required environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
   - Runs on every workflow execution

2. **lint**
   - Runs `npm run lint` (ESLint)
   - Enforces `--max-warnings=0`
   - Runs on every workflow execution

3. **typecheck**
   - Runs `npm run typecheck` (TypeScript `tsc --noEmit`)
   - Runs on every workflow execution

4. **test-unit**
   - Runs `npm run test -- tests/unit/`
   - Uses Vitest
   - Uploads test results and coverage artifacts
   - Runs on every workflow execution

5. **test-integration**
   - Runs `npm run test -- tests/integration/`
   - Uses Vitest
   - Runs on every workflow execution

6. **build**
   - Runs `npm run build` (Next.js production build)
   - Validates build succeeds with required env vars
   - Uploads build artifacts
   - Runs on every workflow execution

7. **css-scan**
   - Runs `node scripts/check-css-tokens.js`
   - Validates CSS token usage
   - Depends on `build` job
   - Runs on every workflow execution

8. **migration-verify**
   - Runs `node scripts/verify-migration.js`
   - Only runs if SQL files are modified (`**/*.sql`)
   - Validates migration files

9. **notify-completion**
   - Emits `ci_completed` repository dispatch event
   - Runs after all other jobs (with `if: always()`)
   - Used for downstream workflows

**Notes:**
- All jobs run in parallel except `css-scan` (depends on `build`)
- Uses concurrency groups to cancel in-progress runs
- No conditions to skip draft PRs

### 2. `synthetic-e2e.yml` (Synthetic E2E Tests)

**Triggers:**
- Push to `main`
- Pull requests targeting `main`
- Scheduled: every 6 hours (`0 */6 * * *`)

**Jobs:**

1. **synthetic-e2e**
   - Builds application
   - Starts production server (`npm start`)
   - Runs curl-based smoke tests:
     - Health check (`/api/health`)
     - Share creation (`POST /api/share`)
     - Shortlink resolution (`GET /api/share?id=...`)
     - RLS verification (`GET /api/favorites`)
   - 10-minute timeout
   - Handles placeholder credentials gracefully

**Notes:**
- Lightweight E2E tests using curl (not Playwright)
- Tests basic API accessibility and RLS behavior
- Does not test full user flows

### 3. `load-test.yml` (Load Testing)

**Triggers:**
- Manual workflow dispatch (with inputs)
- Workflow call from other workflows

**Jobs:**

1. **run-load-tests**
   - Runs load test scenarios via `tsx scripts/load/cli.ts`
   - Scenarios: `sales-baseline`, `sales-burst`, `sales-sustained`, `geo-cache-warmup`, `geo-abuse`, `auth-signin`, `auth-magic-link`, `mutation-sales`, `multi-ip-sales`
   - 30-minute timeout
   - Uploads logs as artifacts

**Notes:**
- Not part of standard CI pipeline
- Requires manual trigger or workflow call
- Used for performance validation

### 4. `load-test-on-deploy.yml`

**Status:** Not reviewed in detail (likely triggers load tests on deployment)

---

## Test Tooling & Commands

### Test Runners

1. **Vitest** (primary)
   - Configuration: `vitest.config.ts`
   - Environment: `jsdom`
   - Setup files: `tests/setup/msw.server.ts`, `tests/setup.ts`
   - Excludes: `tests/e2e/**` (Playwright territory)
   - Timeout: 10 seconds per test
   - Concurrency: max 4 workers, min 1 worker

2. **Playwright** (E2E)
   - Configuration: `playwright.config.ts`
   - Test directory: `tests/e2e`
   - Browsers: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
   - Timeout: 30 seconds per test
   - Retries: 2 in CI, 0 locally
   - Workers: 1 in CI, parallel locally

### Package.json Scripts

- `test`: `vitest run` (runs all Vitest tests)
- `test:ui`: `vitest` (interactive mode)
- `test:e2e`: `playwright test` (runs Playwright E2E tests)
- `lint`: `eslint . --max-warnings=0`
- `typecheck`: `tsc --noEmit`
- `build`: `next build`

### CI Test Execution

- **Unit tests**: `npm run test -- tests/unit/` (Vitest)
- **Integration tests**: `npm run test -- tests/integration/` (Vitest)
- **E2E tests**: Not run in standard CI (only synthetic E2E via curl)

---

## Test Suite Inventory

### Unit Tests (`tests/unit/`)

**Count:** ~88 files (78 `.ts`, 10 `.tsx`)

**Categories:**

1. **Email** (`tests/unit/email/`)
   - `sendEmail.test.ts` – email sending logic
   - `favorites.test.ts` – favorite sales email templates
   - `sales.test.ts` – sale confirmation emails
   - `sellerAnalytics.test.ts` – seller weekly analytics email
   - Email template components (`.test.tsx`): `FavoriteSalesStartingSoonDigestEmail`, `SellerWeeklyAnalyticsEmail`, `FavoriteSaleStartingSoonEmail`, `SaleCreatedConfirmationEmail`

2. **Auth** (`tests/unit/auth/`)
   - `adminGate.test.ts` – admin access checks
   - `resend-confirmation.test.ts` – email confirmation
   - `password-reset.test.ts` – password reset flow
   - `magic-link.test.ts` – magic link auth
   - `profile.test.ts` – profile operations
   - `callback-integration.test.ts` – OAuth callback
   - `server-session.test.ts` – session management
   - `email-redirect.test.ts` – email redirects
   - `auth-api.test.ts` – auth API helpers

3. **Rate Limiting** (`tests/unit/rate-limit/`)
   - `limiter.sliding-window.test.ts` – sliding window algorithm
   - `keys.derivation.test.ts` – key derivation
   - `headers.test.ts` – rate limit headers
   - `rate-limiter.test.ts`, `rateLimiter.test.ts` – rate limiter logic

4. **Geocoding** (`tests/unit/geocode.*.test.ts`)
   - `nominatim-headers.test.ts` – Nominatim API headers
   - `fallback.test.ts` – geocoding fallback logic
   - `cache-ttl.test.ts` – geocoding cache TTL

5. **Images** (`tests/unit/images.*.test.ts`)
   - `validateImageUrl.test.ts` – image URL validation
   - `cover.test.ts` – cover image logic
   - `upload.signed-url.test.ts` – signed URL generation

6. **Data Processing**
   - `social.normalize.test.ts`, `profile.social-normalize.test.ts` – social link normalization
   - `categoryNormalization.test.ts`, `categoryNormalizer.test.ts` – category normalization
   - `zip-normalize.test.ts`, `zip-search.test.ts` – ZIP code normalization
   - `streetNormalize.test.ts` – street address normalization
   - `saleDraft.validation.test.ts` – draft validation
   - `draft.localDraft.test.ts` – local draft storage

7. **Map/Clustering**
   - `clustering.touch-only.test.ts`, `clustering.index.test.ts` – clustering algorithms
   - `cluster.engine.test.ts` – cluster engine
   - `map.tiles.test.ts` – map tile logic
   - `map.debounce-manager.test.ts` – map debouncing
   - `bbox-validator.test.ts` – bounding box validation

8. **Utilities**
   - `share.buildShareUrls.test.ts`, `share.api.test.ts` – share URL generation
   - `url.state.test.ts` – URL state management
   - `filters.hash.test.ts` – filter hashing
   - `datePresets.test.ts`, `resolveDatePreset.test.ts` – date preset resolution
   - `distance.test.ts` – distance calculations
   - `analytics-client.test.ts`, `analytics.mix.test.ts` – analytics
   - `env.test.ts` – environment variable handling
   - `db.schema-names.test.ts` – schema name validation
   - `jobs.queue.test.ts`, `jobs.processor.test.ts` – job queue/processing

9. **UI Components** (`tests/unit/*.test.tsx`)
   - `footer.test.tsx` – footer component
   - `header.full-width.test.tsx` – header component
   - `pinsoverlay.render.test.tsx` – pins overlay
   - `auth.ui.test.tsx` – auth UI
   - `seller.rating-stars.test.tsx` – rating stars component
   - `a11y.smoke.test.tsx` – accessibility smoke test

### Integration Tests (`tests/integration/`)

**Count:** ~100+ files

**Categories:**

1. **API Routes** (`tests/integration/api/`)
   - `cron.favorites-starting-soon.test.ts` – cron endpoint auth/job triggering
   - `cron.favorite-sales-starting-soon.test.ts` – deprecated cron stub
   - `cron.seller-weekly-analytics.test.ts` – seller analytics cron
   - `admin.test-email.test.ts` – admin email test endpoint
   - `admin.email-diagnostics.test.ts` – email diagnostics

2. **Authentication** (`tests/integration/auth/`)
   - `signin-flow.test.tsx` – sign-in flow
   - `resend-integration.test.tsx` – Resend email integration
   - `google-button.test.tsx` – Google auth button

3. **Sales** (`tests/integration/sales.*.test.ts`)
   - `sales.nearby.test.ts` – nearby sales query
   - `sales.api.images.get.test.ts` – sales API image fields
   - `sales.api.single.includes-owner-stats.test.ts` – sale detail with owner stats
   - `sales.imageFields.persist.test.ts` – image field persistence
   - `sales.card.cover.test.tsx` – sale card cover rendering
   - `sales.viewport-restoration.test.tsx` – viewport restoration
   - `sales-list.spec.tsx` – sales list rendering

4. **Drafts** (`tests/integration/drafts.*.test.ts`)
   - `drafts.api.test.ts` – draft API operations
   - `drafts.panel.actions.test.tsx` – draft panel UI
   - `drafts.publish.rollback.test.ts` – draft publish rollback logic

5. **Profile** (`tests/integration/profile/`)
   - `security.test.ts` – profile security
   - `public-routing.test.ts` – public profile routing
   - `bio-persistence.test.ts` – bio persistence
   - `avatar-persistence.test.ts` – avatar persistence
   - `profile.redirect.test.tsx` – profile redirects
   - `profile.social-links.route.test.ts` – social links API

6. **Dashboard** (`tests/integration/dashboard.*.test.tsx`)
   - `dashboard.render.test.tsx` – dashboard rendering
   - `dashboard.profile-edit.test.tsx` – profile editing
   - `dashboard.drafts.test.tsx` – drafts panel

7. **RLS (Row Level Security)** (`tests/integration/rls.*.test.ts`)
   - `rls.profiles.test.ts`, `rls.profiles.self-only.test.ts`, `rls.profiles.owner-allow.test.ts` – profile RLS
   - `rls.sales.anon-deny.test.ts`, `rls.sales.nonowner-deny.test.ts`, `rls.sales.owner-allow.test.ts`, `rls.sales.self-only.test.ts` – sales RLS
   - `rls.items.self-only.test.ts` – items RLS
   - `rls.favorites.self-only.test.ts`, `rls.favorites.owner-allow-deny.test.ts` – favorites RLS
   - `rls.owner.test.ts` – owner access patterns

8. **Rate Limiting** (`tests/integration/rate-limit/`)
   - `sales-viewport.test.ts` – sales viewport rate limiting
   - `mutation-user-keying.test.ts` – mutation rate limiting with user keying
   - `bypass-behavior.test.ts` – rate limit bypass behavior
   - `auth-callback.test.ts` – auth callback rate limiting
   - `upload.rate-limit.test.ts` – upload rate limiting

9. **CSRF Protection** (`tests/integration/csrf.protection.test.ts`)
   - Tests CSRF enforcement on mutation endpoints (POST /api/favorites, POST /api/seller/rating, etc.)

10. **Email** (`tests/integration/email/`)
    - `unsubscribe.test.ts` – email unsubscribe endpoint with token validation

11. **Jobs** (`tests/integration/jobs/`)
    - `favorite-sales-starting-soon.test.ts` – favorite sales starting soon job
    - `seller-weekly-analytics.test.ts` – seller weekly analytics job

12. **Other**
    - `seller.rating.api.test.ts` – seller rating API
    - `suggest-route.test.ts` – geocoding suggest route
    - `overpass.route.test.ts` – Overpass geocoding route
    - `v2.sales.images.persist.test.ts` – v2 sales API image persistence
    - `simplemap.clusters.integration.test.tsx` – map clustering
    - `gridLayout.integration.test.tsx` – grid layout
    - `admin.analytics.summary.test.ts`, `admin.analytics.seed.test.ts` – admin analytics
    - `admin/load-test-api.test.ts` – admin load test API

### E2E Tests (`tests/e2e/`)

**Count:** 17 files (Playwright `.spec.ts`)

**Tests:**
- `happy.spec.ts` – happy path flows
- `complete-flow.spec.ts` – complete user flow
- `add-sale.spec.ts` – add sale flow
- `forms.spec.ts` – form interactions
- `map.pins.spec.ts` – map pins rendering
- `search-smoke.spec.ts` – search smoke test
- `sell-wizard-*.spec.ts` – sell wizard flows (auth gate, geocode blur, overpass prefix)
- `footer.spec.ts` – footer rendering
- `ads.txt.spec.ts` – ads.txt endpoint
- `attribution.visible.spec.ts` – attribution visibility
- `admin-tools-load-testing.spec.ts` – admin tools load testing

**Note:** E2E tests are **not run in standard CI**. They require manual execution or separate workflow.

### Stability Tests (`tests/stability/`)

**Count:** 5 files

- `visible.recompute.spec.ts` – visible recomputation
- `server.predicate.spec.ts` – server predicate logic
- `public.read.shape.spec.ts` – public read shape validation
- `filters.url-parity.spec.ts` – filter URL parity
- `list.dom.spec.tsx` – list DOM stability

### Component Tests (`tests/components/`)

**Count:** 9 files

- `AddSaleForm.test.tsx`, `AddSaleForm.a11y.test.tsx` – add sale form
- `FavoriteButton.test.tsx` – favorite button
- `NearbySalesCard.test.tsx` – nearby sales card
- `OSMAttribution.test.tsx` – OSM attribution
- `ReviewsSection.test.tsx` – reviews section
- `SalesGrid.test.tsx` – sales grid
- `SalesList.mobile.test.tsx` – mobile sales list
- `EmptyState.test.tsx` – empty state

### Performance Tests (`tests/perf/`)

**Count:** 1 file

- `cluster.recompute.benchmark.test.ts` – clustering performance benchmark

---

## Coverage by Feature Area

### Authentication & Profile

**Status:** **Well Covered**

- **Sign-up/sign-in**: `tests/integration/auth/signin-flow.test.tsx`, `tests/unit/auth/*.test.ts`
- **Profile creation/update**: `tests/integration/profile/*.test.ts`, `tests/integration/dashboard.profile-edit.test.tsx`
- **Notification preferences**: Not directly tested (indirectly via profile tests)
- **Avatar upload**: `tests/integration/profile/avatar-persistence.test.ts`

**Gaps:**
- No direct test for notification preferences endpoint (`/api/profile/notifications`)
- No test for profile update endpoint (`/api/profile/update`)

### Sales & Items

**Status:** **Well Covered**

- **Sale creation**: `tests/integration/addSale.insert.test.tsx`, `tests/integration/drafts.api.test.ts`
- **Sale publishing**: `tests/integration/drafts.publish.rollback.test.ts`
- **Item creation/update/delete**: Indirectly tested via drafts/sales tests
- **Archive behavior**: **Not directly tested** (see Recent Changes Coverage)

**Gaps:**
- No test for archive cron (`/api/cron/archive-sales`)
- No test for archive filter logic (1-year retention window)
- No test for dashboard archive tab behavior

### Map/Search

**Status:** **Moderately Covered**

- **Map-based search**: `tests/integration/sales.nearby.test.ts`, `tests/integration/simplemap.clusters.integration.test.tsx`
- **Filters**: `tests/unit/filters.hash.test.ts`, `tests/stability/filters.url-parity.spec.ts`
- **Edge cases**: Limited coverage for invalid bbox, large bbox, no results

**Gaps:**
- No test for map markers endpoint (`/api/sales/markers`)
- No test for search endpoint (`/api/sales/search`)
- Limited edge case coverage for map queries

### Favorites & Reviews

**Status:** **Moderately Covered**

- **Favorite toggle**: `tests/integration/csrf.protection.test.ts` (CSRF enforcement), `tests/components/FavoriteButton.test.tsx`
- **Favorite lists**: Indirectly tested via RLS tests
- **Seller rating**: `tests/integration/seller.rating.api.test.ts`
- **Rating aggregation**: `tests/unit/ratings.access.test.ts`

**Gaps:**
- No direct test for favorites API endpoints (`/api/favorites`, `/api/favorites_v2`)
- No test for favorite lists UI

### Moderation

**Status:** **Not Tested** ⚠️

- **Sale reporting**: **No tests found** for `/api/sales/[id]/report`
- **Auto-hide behavior**: **No tests found** for multiple unique reports triggering auto-hide
- **Admin report actions**: **No tests found** for `/api/admin/reports`, `/api/admin/reports/[id]`
- **Account lock enforcement**: **No tests found** for `assertAccountNotLocked` behavior across endpoints
- **Hidden sales exclusion**: **No tests found** for `moderation_status = 'hidden_by_admin'` filtering
- **Hidden sales detail blocking**: **No tests found** for non-admin users being blocked from viewing hidden sales

**Gaps:**
- **Critical gap**: Entire moderation system is untested
- Account lock checks are mocked in some tests (`is_locked: false`) but never tested with `is_locked: true`
- No tests for admin user management (`/api/admin/users`, `/api/admin/users/[id]/lock`)

### Emails & Cron

**Status:** **Moderately Covered**

- **Email send functions**: `tests/unit/email/*.test.ts` (unit tests with mocks)
- **Cron endpoints**: `tests/integration/api/cron.*.test.ts` (endpoint auth/job triggering, not actual job execution)
- **Email templates**: `tests/unit/email/*.test.tsx` (React Email components)
- **Unsubscribe**: `tests/integration/email/unsubscribe.test.ts` (comprehensive)
- **Job processors**: `tests/integration/jobs/*.test.ts` (job logic)

**Gaps:**
- No test for daily cron (`/api/cron/daily`) which includes moderation digest
- No test for moderation digest cron (`/api/cron/moderation-daily-digest`)
- Cron tests mock job processors, don't test actual job execution with real data
- No test for cron error handling/retry logic

### Security

**Status:** **Well Covered**

- **CSRF protection**: `tests/integration/csrf.protection.test.ts` (comprehensive)
- **Rate limiting**: `tests/unit/rate-limit/*.test.ts`, `tests/integration/rate-limit/*.test.ts` (comprehensive)
- **RLS assumptions**: `tests/integration/rls.*.test.ts` (comprehensive coverage of RLS policies)

**Gaps:**
- No test for admin gate bypass scenarios
- No test for rate limit bypass edge cases

---

## Recent Changes Coverage

### Moderation System

**Status:** **Not Tested** ⚠️

**What exists:**
- Database schema (migrations 107-111)
- API endpoints (`/api/sales/[id]/report`, `/api/admin/reports`, `/api/admin/users/[id]/lock`)
- Account lock helper (`lib/auth/accountLock.ts`)
- Account lock enforcement across write endpoints
- Hidden sales filtering in public queries
- Hidden sales blocking on detail page

**What's missing:**
- **No tests for sale reporting** (`POST /api/sales/[id]/report`)
  - No test for report creation
  - No test for duplicate report prevention
  - No test for auto-hide threshold (multiple unique reporters)
  - No test for rate limiting on reports
  - No test for CSRF protection on reports

- **No tests for admin report management** (`GET /api/admin/reports`, `PATCH /api/admin/reports/[id]`)
  - No test for listing reports
  - No test for updating report status
  - No test for hiding sales via admin action
  - No test for locking accounts via admin action

- **No tests for account lock enforcement**
  - No test that locked users cannot create sales
  - No test that locked users cannot update profile
  - No test that locked users cannot create items
  - No test that locked users cannot add favorites
  - No test that locked users cannot rate sellers
  - No test for lock reason display

- **No tests for hidden sales visibility**
  - No test that `hidden_by_admin` sales are excluded from `/api/sales`
  - No test that `hidden_by_admin` sales are excluded from `/api/sales/markers`
  - No test that `hidden_by_admin` sales are excluded from `/api/sales/search`
  - No test that non-admin users get 404 when accessing hidden sale detail
  - No test that admin users can view hidden sale detail

- **No tests for admin user management** (`GET /api/admin/users`, `POST /api/admin/users/[id]/lock`)
  - No test for user search
  - No test for user lock/unlock
  - No test for lock reason persistence

**Risk Level:** **HIGH** – Moderation is a critical feature with no automated test coverage

### Archive Behavior

**Status:** **Not Tested** ⚠️

**What exists:**
- Archive cron endpoint (`/api/cron/archive-sales`)
- Archive filter logic (1-year retention window in `lib/data/salesAccess.ts`)
- Dashboard archive tab (shows archived sales count)

**What's missing:**
- **No test for archive cron** (`/api/cron/archive-sales`)
  - No test for archiving old sales
  - No test for cron auth
  - No test for error handling

- **No test for archive filter logic**
  - No test for 1-year retention window
  - No test for archived sales being excluded from active listings
  - No test for archived sales being included in archive tab

- **No test for dashboard archive tab**
  - No test for archived count display
  - No test for archived sales loading

**Risk Level:** **MEDIUM** – Archive is important but less critical than moderation

### Unsubscribe & Email Preferences

**Status:** **Well Covered** ✅

**What exists:**
- `tests/integration/email/unsubscribe.test.ts` (comprehensive)
  - Valid token scenarios
  - Invalid/expired/used token scenarios
  - Rate limiting
  - Error handling

**Gaps:**
- No test for email preferences affecting job execution (e.g., skipping emails for users who opted out)
- No test for unsubscribe token generation

**Risk Level:** **LOW** – Well tested

---

## Gaps, Risks & Recommendations

### Critical Gaps (P0 – Must Have Before Launch)

1. **Moderation System Test Coverage** ⚠️
   - **Risk:** High-impact bugs in moderation could allow inappropriate content or fail to protect users
   - **Recommendations:**
     - Add integration test for sale reporting (`POST /api/sales/[id]/report`)
       - Test report creation, duplicate prevention, rate limiting, CSRF
       - Test auto-hide threshold (e.g., 3 unique reporters in 24h)
     - Add integration test for admin report management
       - Test listing reports, updating status, hiding sales, locking accounts
     - Add integration test for account lock enforcement
       - Test that locked users cannot perform write operations (create sale, update profile, add favorite, rate seller)
       - Test across multiple endpoints
     - Add integration test for hidden sales visibility
       - Test that `hidden_by_admin` sales are excluded from public listings
       - Test that non-admin users get 404 on hidden sale detail
       - Test that admin users can view hidden sale detail
     - Add integration test for admin user management
       - Test user search, lock/unlock, lock reason persistence

2. **Archive Cron Test Coverage** ⚠️
   - **Risk:** Archive cron failures could lead to data retention issues
   - **Recommendations:**
     - Add integration test for archive cron (`/api/cron/archive-sales`)
       - Test archiving sales older than threshold
       - Test cron auth
       - Test error handling

### Important Gaps (P1 – Should Have)

3. **Archive Filter Logic Test Coverage**
   - **Risk:** Incorrect archive filtering could show/hide wrong sales
   - **Recommendations:**
     - Add integration test for 1-year retention window
     - Add test for archived sales being excluded from active listings
     - Add test for archived sales being included in archive tab

4. **Map/Search Edge Cases**
   - **Risk:** Invalid queries could cause errors or performance issues
   - **Recommendations:**
     - Add tests for invalid bbox, large bbox, no results scenarios
     - Add tests for map markers endpoint (`/api/sales/markers`)
     - Add tests for search endpoint (`/api/sales/search`)

5. **Daily Cron Test Coverage**
   - **Risk:** Daily cron includes moderation digest; failures could go unnoticed
   - **Recommendations:**
     - Add integration test for daily cron (`/api/cron/daily`)
       - Test all tasks (archive, moderation digest, etc.)
       - Test error handling for individual tasks

6. **Email Preferences in Job Execution**
   - **Risk:** Emails might be sent to users who opted out
   - **Recommendations:**
     - Add test that email jobs respect user preferences
     - Add test for unsubscribe token generation

### Nice to Have (P2)

7. **E2E Test Coverage in CI**
   - **Recommendation:** Add Playwright E2E tests to CI pipeline (currently only synthetic E2E via curl)

8. **Profile Update Endpoint Test**
   - **Recommendation:** Add direct test for `/api/profile/update`

9. **Notification Preferences Endpoint Test**
   - **Recommendation:** Add direct test for `/api/profile/notifications`

10. **Favorites API Direct Tests**
    - **Recommendation:** Add direct tests for `/api/favorites` and `/api/favorites_v2` (currently only CSRF tests)

11. **Cron Job Execution Tests**
    - **Recommendation:** Add tests that actually execute cron jobs with real data (not just mocked processors)

---

## Summary

### Test Coverage Overview

- **Unit Tests:** ~88 files – Well covered for utilities, helpers, and pure functions
- **Integration Tests:** ~100+ files – Good coverage for API routes, RLS, CSRF, rate limiting
- **E2E Tests:** 17 files – Not run in CI, require manual execution
- **Moderation Tests:** 0 files – **Critical gap**
- **Archive Tests:** 0 files – **Important gap**

### CI Pipeline Health

- ✅ Lint, typecheck, build run on every PR
- ✅ Unit and integration tests run on every PR
- ⚠️ E2E tests not in CI (only synthetic E2E via curl)
- ✅ Migration verification runs when SQL files change

### Risk Assessment

- **HIGH RISK:** Moderation system has no test coverage
- **MEDIUM RISK:** Archive behavior has no test coverage
- **LOW RISK:** Core features (auth, sales, favorites, emails) are well tested

### Quick Wins

1. Add moderation system integration tests (P0)
2. Add archive cron test (P0)
3. Add hidden sales visibility tests (P0)
4. Add account lock enforcement tests (P0)
5. Add archive filter logic tests (P1)

---

**Next Steps:**
1. Prioritize P0 gaps (moderation, archive)
2. Create test plan for moderation system
3. Add tests incrementally, starting with highest-risk areas
4. Consider adding E2E tests to CI pipeline


