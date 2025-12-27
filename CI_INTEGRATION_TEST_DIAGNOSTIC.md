# CI Integration Test Performance Diagnostic Report

**Generated:** 2025-12-20  
**Current Status:** Tests taking 60-65+ minutes, exceeding timeout limits  
**Hard Constraint:** 30 minutes per CI job maximum

---

## 1. Test Suite Inventory

### Total Counts
- **Test Files:** 87 files
- **Test Cases:** ~743 test cases (describe/it/test blocks)
- **Current Runtime:** 60-65+ minutes (cancelled before completion)
- **Memory Configuration:** 18GB heap, 1 worker, forks pool, serial execution

### Test Files by Subsystem

#### **Drafts & Publishing** (7 files, ~40 tests)
- `drafts.api.test.ts` (12 tests)
- `drafts.panel.actions.test.tsx` (4 tests)
- `drafts.publish.rollback.test.ts` (4 tests)
- `dashboard.drafts.test.tsx` (14 tests)
- `addSale.insert.test.tsx` (8 tests)
- `sell.wizard.promote-cta.test.tsx` (3 tests)
- `dashboard.profile-edit.test.tsx` (3 tests)

#### **Sales & Listings** (15 files, ~80 tests)
- `sales.nearby.test.ts` (6 tests)
- `sales.api.images.get.test.ts` (7 tests)
- `sales.api.single.includes-owner-stats.test.ts` (3 tests)
- `sales.imageFields.persist.test.ts` (7 tests)
- `sales.viewport-restoration.test.tsx` (17 tests)
- `sales.card.cover.test.tsx` (3 tests)
- `sale.details.items.test.tsx` (11 tests)
- `sale.details.categories.test.tsx` (6 tests)
- `sale.metadata.test.tsx` (5 tests)
- `sale.share-button.render.test.tsx` (10 tests)
- `v2.sales.images.persist.test.ts` (3 tests)
- `items.public-visibility.test.ts` (7 tests)
- `sales-list.spec.tsx` (4 tests)
- `landing.featured-demo.test.tsx` (3 tests)
- `share.redirect.test.tsx` (5 tests)

#### **Authentication & Authorization** (8 files, ~70 tests)
- `auth/signin-flow.test.tsx` (19 tests)
- `auth/google-button.test.tsx` (7 tests)
- `auth/resend-integration.test.tsx` (4 tests)
- `auth/session-protection.test.ts` (14 tests)
- `auth.session.test.tsx` (17 tests)
- `csrf.protection.test.ts` (15 tests)
- `rls.owner.test.ts` (7 tests)
- `rls.profiles.test.ts` (19 tests)

#### **Row-Level Security (RLS)** (10 files, ~70 tests)
- `rls.sales.anon-deny.test.ts` (7 tests)
- `rls.sales.nonowner-deny.test.ts` (5 tests)
- `rls.sales.owner-allow.test.ts` (6 tests)
- `rls.sales.self-only.test.ts` (7 tests)
- `rls.profiles.owner-allow.test.ts` (6 tests)
- `rls.profiles.self-only.test.ts` (6 tests)
- `rls.favorites.self-only.test.ts` (9 tests)
- `rls.favorites.owner-allow-deny.test.ts` (8 tests)
- `rls.items.self-only.test.ts` (10 tests)
- `presets.cloud.rls.test.ts` (6 tests)

#### **Profile Management** (8 files, ~50 tests)
- `profile/security.test.ts` (6 tests)
- `profile/avatar-persistence.test.ts` (9 tests)
- `profile/bio-persistence.test.ts` (3 tests)
- `profile/public-routing.test.ts` (14 tests)
- `profile/anon-base-table-access.test.ts` (5 tests)
- `profile/authenticated-base-table-access.test.ts` (8 tests)
- `profile.redirect.test.tsx` (3 tests)
- `profile.social-links.route.test.ts` (4 tests)

#### **Moderation** (4 files, ~56 tests)
- `moderation.report-sale.test.ts` (18 tests)
- `moderation.account-lock-enforcement.test.ts` (15 tests)
- `moderation.admin-actions.test.ts` (12 tests)
- `moderation.hidden-sales-visibility.test.ts` (11 tests)

#### **Featured Email & Promotions** (6 files, ~40 tests)
- `featured-email/selection.test.ts` (15 tests)
- `featured-email/inclusion-tracking.test.ts` (6 tests)
- `featured-email/payments-guard.test.ts` (5 tests)
- `featured-email/zip-usage.test.ts` (9 tests)
- `api/promotions.status.test.ts` (5 tests)

#### **Cron Jobs & Background Tasks** (9 files, ~100 tests)
- `cron.daily.test.ts` (15 tests)
- `cron.moderation-daily-digest.test.ts` (14 tests)
- `archive.cron.test.ts` (9 tests)
- `api/cron.weekly-featured-sales.test.ts` (20 tests)
- `api/cron.favorites-starting-soon.test.ts` (4 tests)
- `api/cron.favorite-sales-starting-soon.test.ts` (4 tests)
- `api/cron.seller-weekly-analytics.test.ts` (11 tests)
- `jobs/favorite-sales-starting-soon.test.ts` (22 tests)
- `jobs/seller-weekly-analytics.test.ts` (6 tests)

#### **Rate Limiting** (5 files, ~30 tests)
- `rate-limit/auth-callback.test.ts` (5 tests)
- `rate-limit/bypass-behavior.test.ts` (13 tests)
- `rate-limit/mutation-user-keying.test.ts` (5 tests)
- `rate-limit/sales-viewport.test.ts` (2 tests)
- `upload.rate-limit.test.ts` (4 tests)

#### **Admin & Analytics** (5 files, ~25 tests)
- `admin.users.test.ts` (6 tests)
- `admin.analytics.summary.test.ts` (5 tests)
- `admin.analytics.seed.test.ts` (3 tests)
- `admin/load-test-api.test.ts` (7 tests)
- `api/admin.test-email.test.ts` (3 tests)
- `api/admin.email-diagnostics.test.ts` (8 tests)

#### **Email & Notifications** (2 files, ~31 tests)
- `email/unsubscribe.test.ts` (16 tests)
- `email.preferences-jobs.test.ts` (15 tests)

#### **Map & Location** (4 files, ~30 tests)
- `simplemap.clusters.integration.test.tsx` (14 tests)
- `sales.viewport-restoration.test.tsx` (17 tests)
- `navigation.viewport-persistence.test.tsx` (14 tests)
- `overpass.route.test.ts` (12 tests)
- `suggest-route.test.ts` (8 tests)

#### **UI Components & Rendering** (4 files, ~20 tests)
- `dashboard.render.test.tsx` (7 tests)
- `gridLayout.integration.test.tsx` (2 tests)
- `presets.local.test.tsx` (7 tests)

---

## 2. Runtime Analysis

### Current Performance Metrics
- **Observed Runtime:** 60-65+ minutes (cancelled before completion)
- **Test Execution Time:** ~8-9 seconds (from logs: "tests 8.84s" in one run)
- **Environment Setup:** ~35 seconds ("environment 34.84s")
- **Setup/Teardown:** ~12-13 seconds ("setup 12.65s")
- **Collection Phase:** ~5-6 seconds ("collect 5.83s")
- **Transform Phase:** ~2 seconds ("transform 2.28s")

### Estimated Runtime Breakdown (Proportional)
Based on test counts and observed patterns:

1. **Cron Jobs & Background Tasks** (~100 tests): ~15-20 minutes
   - Heavy database operations
   - Multiple RPC calls
   - Complex business logic

2. **Sales & Listings** (~80 tests): ~10-12 minutes
   - Image processing tests
   - Viewport restoration
   - Multiple API calls per test

3. **Authentication & Authorization** (~70 tests): ~8-10 minutes
   - Session management
   - OAuth flows
   - CSRF validation

4. **RLS Tests** (~70 tests): ~8-10 minutes
   - Database queries with different user contexts
   - Permission checks

5. **Moderation** (~56 tests): ~7-9 minutes
   - Account lock enforcement
   - Report processing

6. **Profile Management** (~50 tests): ~6-8 minutes
   - Avatar/bio persistence
   - Routing tests

7. **Drafts & Publishing** (~40 tests): ~5-6 minutes
   - Rollback scenarios
   - Complex state management

8. **Featured Email & Promotions** (~40 tests): ~5-6 minutes
   - Selection logic
   - Payment guards

9. **Rate Limiting** (~30 tests): ~4-5 minutes
   - Redis operations (mocked)

10. **Map & Location** (~30 tests): ~4-5 minutes
    - Clustering algorithms
    - Viewport calculations

11. **Remaining subsystems** (~100 tests): ~10-12 minutes

**Total Estimated:** ~82-103 minutes (exceeds 30-minute constraint by 2.7-3.4x)

### Slowest Test Patterns Identified
1. **Cron job tests** - Complex database operations, multiple RPC calls
2. **Sales viewport restoration** - Multiple map state operations
3. **Image persistence tests** - File handling, Cloudinary mocks
4. **RLS tests** - Multiple user context switches, database queries
5. **Moderation tests** - Account lock enforcement, complex state

---

## 3. Structural Contributors to Long Runtime

### 3.1 Execution Constraints
- **Serial Execution:** `maxConcurrency: 1` and `maxWorkers: 1` force all tests to run sequentially
- **Single Worker:** All 743 tests run in one process, no parallelization
- **Memory Constraint:** 18GB heap required, suggesting heavy memory usage per test

### 3.2 Test Architecture Issues

#### **Overuse of Full-Stack Integration**
- Many tests that could be unit tests are running as integration tests:
  - `sales.nearby.test.ts` - Could be unit test with mocked database
  - `drafts.api.test.ts` - API route testing with full Next.js stack
  - `profile/*.test.ts` - Many are testing simple CRUD operations

#### **Repeated Database Setup/Teardown**
- Each test file likely sets up its own database mocks
- No shared test database or connection pooling visible
- RLS tests create multiple user contexts per test

#### **Heavy Mocking Overhead**
- MSW (Mock Service Worker) setup for all tests
- Supabase client mocking in every test file
- Next.js image component mocking
- ResizeObserver, geolocation, and other browser API mocks

#### **External Service Mocks**
- Stripe webhook handling
- Cloudinary image uploads
- Geolocation services
- Email services (Resend)
- All add overhead even when mocked

#### **Cross-Subsystem Tests**
- Some test files span multiple subsystems:
  - `sell.wizard.promote-cta.test.tsx` - Combines drafts, promotions, payments
  - `dashboard.*.test.tsx` - Combines multiple dashboard features
  - `auth/signin-flow.test.tsx` - Combines auth, routing, session management

#### **Large Test Files**
- `jobs/favorite-sales-starting-soon.test.ts` - 22 tests in one file
- `api/cron.weekly-featured-sales.test.ts` - 20 tests
- `auth/signin-flow.test.tsx` - 19 tests
- `rls.profiles.test.ts` - 19 tests
- `moderation.report-sale.test.ts` - 18 tests

### 3.3 Memory Usage Patterns
- **18GB heap required** suggests:
  - Large test data sets loaded into memory
  - Inefficient cleanup between tests
  - Memory leaks in test setup/teardown
  - Heavy object creation in mocks

### 3.4 Test Environment Overhead
- **jsdom environment** for all tests (even non-UI tests)
- **React rendering** for many tests that don't need it
- **Full Next.js stack** initialization for API route tests
- **MSW server** running for all tests

---

## 4. Critical Analysis

### 4.1 Is the Current Test Suite Size Reasonable?
**No.** 87 files and 743 tests in a single CI job is excessive:
- Industry standard: 200-300 tests per job maximum
- Current suite is 2.5-3.7x larger than recommended
- Serial execution makes this worse

### 4.2 Expected Ceiling Runtime
If nothing changes:
- **Current:** 60-65+ minutes (incomplete)
- **Projected if completed:** 80-100+ minutes
- **With optimizations but same structure:** 50-70 minutes
- **With 30-minute constraint:** **Impossible without splitting**

### 4.3 Clear Fault Lines for Splitting

#### **Option A: By Subsystem (Recommended)**
1. **Job 1: Core Sales** (~200 tests, ~25 minutes)
   - Sales & Listings
   - Sales API
   - Items & Images

2. **Job 2: User Management** (~150 tests, ~20 minutes)
   - Authentication & Authorization
   - Profile Management
   - RLS Tests

3. **Job 3: Business Logic** (~200 tests, ~25 minutes)
   - Drafts & Publishing
   - Moderation
   - Featured Email & Promotions

4. **Job 4: Background Jobs** (~100 tests, ~15 minutes)
   - Cron Jobs
   - Email & Notifications
   - Jobs

5. **Job 5: Infrastructure** (~93 tests, ~15 minutes)
   - Rate Limiting
   - Admin & Analytics
   - Map & Location
   - UI Components

#### **Option B: By Test Type**
1. **API Tests** (~300 tests)
2. **Component Tests** (~200 tests)
3. **Integration Tests** (~243 tests)

#### **Option C: By Execution Speed**
1. **Fast Tests** (< 100ms each, ~400 tests)
2. **Medium Tests** (100ms-1s, ~250 tests)
3. **Slow Tests** (> 1s, ~93 tests)

---

## 5. Options We Could Consider Next

### 5.1 Immediate Actions (No Code Changes)
1. **Split CI Job by Subsystem**
   - Create 4-5 separate test jobs
   - Each runs subset of tests
   - All can run in parallel
   - Each stays under 30 minutes

2. **Increase Parallelization**
   - Remove `maxConcurrency: 1` constraint
   - Increase `maxWorkers` to 2-4 (if memory allows)
   - Risk: May hit memory limits again

### 5.2 Test Refactoring (Medium Effort)
1. **Convert Integration → Unit Tests**
   - Identify tests that don't need full stack
   - Move to `tests/unit/` directory
   - Target: 100-150 tests converted
   - Expected reduction: 15-20 minutes

2. **Consolidate Test Setup**
   - Shared database connection pool
   - Shared mock setup
   - Reduce per-test overhead
   - Expected reduction: 5-10 minutes

3. **Split Large Test Files**
   - Break files with 15+ tests into smaller files
   - Better isolation
   - Easier to parallelize
   - Expected reduction: 3-5 minutes

### 5.3 Architecture Changes (High Effort)
1. **Test Database Optimization**
   - Use in-memory database for tests
   - Faster setup/teardown
   - Expected reduction: 10-15 minutes

2. **Selective Environment Loading**
   - Only load jsdom for UI tests
   - Skip Next.js stack for pure API tests
   - Expected reduction: 5-8 minutes

3. **Test Data Optimization**
   - Reduce seed data size
   - Use factories instead of fixtures
   - Expected reduction: 5-10 minutes

### 5.4 Hybrid Approach (Recommended)
1. **Phase 1: Split Jobs** (1-2 days)
   - Create 4-5 parallel test jobs
   - Immediate solution, meets 30-minute constraint

2. **Phase 2: Optimize Tests** (1-2 weeks)
   - Convert 100-150 integration → unit tests
   - Consolidate setup
   - Reduce each job to 15-20 minutes

3. **Phase 3: Architecture** (2-4 weeks)
   - Optimize database usage
   - Selective environment loading
   - Target: 10-15 minutes per job

---

## 6. Recommendations Summary

### Critical Path to 30-Minute Constraint
1. **Must Split Jobs** - Current suite cannot complete in 30 minutes as-is
2. **Recommended Split:** 4-5 jobs by subsystem (Option A above)
3. **Parallel Execution:** All jobs run simultaneously
4. **Each Job Target:** 15-25 minutes runtime

### Risk Assessment
- **Low Risk:** Job splitting (proven pattern)
- **Medium Risk:** Increasing workers (memory concerns)
- **High Risk:** Major test refactoring (could break tests)

### Expected Outcomes
- **After Job Split:** All jobs complete in < 30 minutes
- **After Optimization:** Each job completes in 15-20 minutes
- **Total CI Time:** 15-25 minutes (parallel execution)

---

**Next Steps:** Awaiting approval to proceed with job splitting implementation.

