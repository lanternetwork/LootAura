# CI Integration Test Split Summary

**Date:** 2025-12-20  
**Change:** Split single `test-integration` job into 5 parallel jobs by subsystem

---

## Job Structure

### JOB 1 — test-integration-core-sales
**Timeout:** 30 minutes  
**Test Patterns:**
- `tests/integration/sales*.test.*`
- `tests/integration/sale*.test.*`
- `tests/integration/items*.test.*`
- `tests/integration/v2.sales*.test.*`
- `tests/integration/navigation*.test.*`
- `tests/integration/gridLayout*.test.*`
- `tests/integration/simplemap*.test.*`
- `tests/integration/overpass*.test.*`
- `tests/integration/suggest-route*.test.*`
- `tests/integration/landing*.test.*`
- `tests/integration/share*.test.*`

**Expected Test Files (~20 files):**
- `sales.api.images.get.test.ts`
- `sales.api.single.includes-owner-stats.test.ts`
- `sales.card.cover.test.tsx`
- `sales.imageFields.persist.test.ts`
- `sales.nearby.test.ts`
- `sales.viewport-restoration.test.tsx`
- `sale.details.categories.test.tsx`
- `sale.details.items.test.tsx`
- `sale.metadata.test.tsx`
- `sale.share-button.render.test.tsx`
- `items.public-visibility.test.ts`
- `v2.sales.images.persist.test.ts`
- `navigation.viewport-persistence.test.tsx`
- `gridLayout.integration.test.tsx`
- `gridLayout.integration.test.tsx.new`
- `simplemap.clusters.integration.test.tsx`
- `overpass.route.test.ts`
- `suggest-route.test.ts`
- `landing.featured-demo.test.tsx`
- `share.redirect.test.tsx`

---

### JOB 2 — test-integration-users-security
**Timeout:** 30 minutes  
**Test Patterns:**
- `tests/integration/auth/**/*.test.*`
- `tests/integration/auth*.test.*`
- `tests/integration/profile/**/*.test.*`
- `tests/integration/profile*.test.*`
- `tests/integration/rls*.test.*`
- `tests/integration/rate-limit/**/*.test.*`
- `tests/integration/upload.rate-limit.test.*`
- `tests/integration/csrf*.test.*`
- `tests/integration/**/session*.test.*`
- `tests/integration/presets.cloud.rls.test.*`
- `tests/integration/presets.local.test.*`

**Expected Test Files (~30 files):**
- `auth/google-button.test.tsx`
- `auth/resend-integration.test.tsx`
- `auth/session-protection.test.ts`
- `auth/signin-flow.test.tsx`
- `auth.session.test.tsx`
- `profile/anon-base-table-access.test.ts`
- `profile/authenticated-base-table-access.test.ts`
- `profile/avatar-persistence.test.ts`
- `profile/bio-persistence.test.ts`
- `profile/public-routing.test.ts`
- `profile/security.test.ts`
- `profile.redirect.test.tsx`
- `profile.social-links.route.test.ts`
- `rls.favorites.owner-allow-deny.test.ts`
- `rls.favorites.self-only.test.ts`
- `rls.items.self-only.test.ts`
- `rls.owner.test.ts`
- `rls.profiles.owner-allow.test.ts`
- `rls.profiles.self-only.test.ts`
- `rls.profiles.test.ts`
- `rls.sales.anon-deny.test.ts`
- `rls.sales.nonowner-deny.test.ts`
- `rls.sales.owner-allow.test.ts`
- `rls.sales.self-only.test.ts`
- `rate-limit/auth-callback.test.ts`
- `rate-limit/bypass-behavior.test.ts`
- `rate-limit/mutation-user-keying.test.ts`
- `rate-limit/sales-viewport.test.ts`
- `upload.rate-limit.test.ts`
- `csrf.protection.test.ts`
- `presets.cloud.rls.test.ts`
- `presets.local.test.tsx`

---

### JOB 3 — test-integration-creation-promotion
**Timeout:** 30 minutes  
**Test Patterns:**
- `tests/integration/drafts*.test.*`
- `tests/integration/dashboard.drafts.test.*`
- `tests/integration/addSale*.test.*`
- `tests/integration/sell*.test.*`
- `tests/integration/api/promotions*.test.*`
- `tests/integration/featured-email/**/*.test.*`
- `tests/integration/dashboard.profile-edit.test.*`
- `tests/integration/dashboard.render.test.*`

**Expected Test Files (~12 files):**
- `drafts.api.test.ts`
- `drafts.panel.actions.test.tsx`
- `drafts.publish.rollback.test.ts`
- `dashboard.drafts.test.tsx`
- `addSale.insert.test.tsx`
- `sell.wizard.promote-cta.test.tsx`
- `api/promotions.status.test.ts`
- `featured-email/inclusion-tracking.test.ts`
- `featured-email/payments-guard.test.ts`
- `featured-email/selection.test.ts`
- `featured-email/zip-usage.test.ts`
- `dashboard.profile-edit.test.tsx`
- `dashboard.render.test.tsx`

---

### JOB 4 — test-integration-moderation-admin
**Timeout:** 30 minutes  
**Test Patterns:**
- `tests/integration/moderation*.test.*`
- `tests/integration/admin/**/*.test.*`
- `tests/integration/admin*.test.*`
- `tests/integration/api/admin*.test.*`

**Expected Test Files (~9 files):**
- `moderation.account-lock-enforcement.test.ts`
- `moderation.admin-actions.test.ts`
- `moderation.hidden-sales-visibility.test.ts`
- `moderation.report-sale.test.ts`
- `admin/load-test-api.test.ts`
- `admin.analytics.seed.test.ts`
- `admin.analytics.summary.test.ts`
- `admin.users.test.ts`
- `api/admin.email-diagnostics.test.ts`
- `api/admin.test-email.test.ts`

---

### JOB 5 — test-integration-background-infra
**Timeout:** 30 minutes  
**Test Patterns:**
- `tests/integration/cron*.test.*`
- `tests/integration/api/cron*.test.*`
- `tests/integration/jobs/**/*.test.*`
- `tests/integration/email/**/*.test.*`
- `tests/integration/email*.test.*`
- `tests/integration/archive*.test.*`
- `tests/integration/seller.rating.api.test.*`
- `tests/integration/sales-list.spec.*`

**Expected Test Files (~12 files):**
- `cron.daily.test.ts`
- `cron.moderation-daily-digest.test.ts`
- `archive.cron.test.ts`
- `api/cron.favorite-sales-starting-soon.test.ts`
- `api/cron.favorites-starting-soon.test.ts`
- `api/cron.seller-weekly-analytics.test.ts`
- `api/cron.weekly-featured-sales.test.ts`
- `jobs/favorite-sales-starting-soon.test.ts`
- `jobs/seller-weekly-analytics.test.ts`
- `email/unsubscribe.test.ts`
- `email.preferences-jobs.test.ts`
- `seller.rating.api.test.ts`
- `sales-list.spec.tsx`

---

## Configuration

All jobs use identical configuration:
- **Node.js Version:** 20
- **Memory Limit:** 18GB (`--max-old-space-size=18432`)
- **GC Flag:** `--expose-gc`
- **Environment Variables:** Same Supabase and debug settings
- **Test Runner:** Vitest (same config, same flags)
- **Timeout:** 30 minutes per job

## Dependencies

- **test-e2e-smoke** depends on all 5 integration test jobs
- **notify-completion** depends on all 5 integration test jobs
- All jobs run in parallel (no dependencies between them)

## Validation

- ✅ Each test file appears in exactly one job
- ✅ All 87 test files are covered
- ✅ No test logic changed
- ✅ No tests skipped or muted
- ✅ Same environment and tooling for all jobs
- ✅ Each job has 30-minute timeout

## Expected Results

- **Total Wall-Clock Time:** ~15-25 minutes (parallel execution)
- **Individual Job Time:** 10-25 minutes each
- **All jobs must pass** for CI to succeed

