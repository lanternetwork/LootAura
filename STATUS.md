# Loot Aura Repository Status

Conflict reconciled on 2025-10-13 — stabilization content retained; recent main entries preserved.

## 1. Branch & Commit
- **Current branch:** milestone/auth-profile
- **Latest commit (branch):** e55f25a — ci: redeploy trigger (by system)
- **Recent on main:** 7a5b049 — Close Milestone: Map + Filter Sync — enforce single grid container, fix layout hierarchy, verify arbiter authority, add tests & CI guards (by lanternetwork on 2025-10-12 17:11:56 -0400)
- **Active PR:** milestone/auth-profile → main
- **CI status:** pending (will start after conflicts resolved)

## 2. Database Schema
- **Schema:** lootaura_v2
- **Tables present:** profiles, sales, items, favorites, reviews, zipcodes (status: unknown)
- **RLS:** status unknown per table
- **Geom & PostGIS:** status unknown (GIST index, trigger)
- **Last applied migrations:** unknown (requires DB connectivity)

## 3. Public Views & RPC (Option A)
- **Views present:** sales_v2, items_v2, favorites_v2, profiles_v2 (status: unknown)
- **RPC functions:** search_sales_within_distance, search_sales_bbox (status: unknown)
- **Grants status:** anon/auth read/write (status: unknown)
- **Schema switching removed:** partial — server client forces public schema

## 4. App Features & APIs
- **/api/sales:** RPC path preferred with fallback (degraded: possible)
- **/api/reviews:** address_key + seller_id linkage (status: planned)
- **/api/health/** routes:** env, db, schema, postgis, auth (status: needs verification)
- **Pagination:** virtualized list; page size varies
- **Mock/Seed data count:** unknown (seed migrations present)
- **Admin Tools:** present; functionality depends on schema application

## 5. Frontend & UX
- **Map behavior:** ✅ full-radius pins via markers API (server cap, no clustering)
- **Responsiveness:** mobile/tablet friendly
- **Accessibility score:** not measured in this run
- **Branding:** Loot Aura in progress; verify no YardSaleFinder remnants

## 6. Deployments
- **Vercel URLs:** Production/Preview (insert)
- **Environment vars:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, etc. (verify set)
- **Last deploy health:** unknown in this run

## 7. Known Issues / TODO
- Apply 032/033 migrations to restore lootaura_v2 schema
- Apply 034 public views/RPC and verify grants
- Wire /api/sales fully to Option A RPC, confirm degraded flag
- Seed minimal data (Louisville, Nashville, Atlanta) and verify counts
- Consider marker clustering for dense maps

## 8. CI Hygiene

### Workflow Cleanup
- **Legacy workflows removed**: bootstrap.yml, ci-main.yml, generate-lockfile.yml, update-status.yml, ingest-craigslist-backup.yml, test.yml, ysf-step-b.yml
- **Unified workflow only**: `.github/workflows/ci.yml`
- **Standard job names**: env-presence, lint, typecheck, test-unit, test-integration, build, css-scan, migration-verify
- **Required checks for Rulesets/Vercel**: ci/env-presence, ci/lint, ci/typecheck, ci/test-unit, ci/test-integration, ci/build

### CI Stabilization: Red→Green
- **ESLint Configuration**: Added comprehensive rules for TypeScript, React, testing
- **Test Harness**: Added global DOM shims, fetch mocking, network isolation
- **Harness Parse Fixes**: DOMRect.fromRect, JSX-free setup.ts, JSX tests renamed to .tsx
- **Env-aware Lint**: Browser/Node overrides; legacy folder ignored
- **Environment Handling**: Public envs only, no service role in CI
- **CSS Validation**: Tailwind grid token scanner for responsive layouts
- **Migration Verification**: Database schema validation on SQL changes
- **Build Process**: Next.js build with proper environment variables
- **Status**: Foundation ready, awaiting Owner secrets configuration

### CI Status
- **Single workflow**: Only `ci` workflow is active
- **Triggers**: pull_request to main, push to any branch
- **Concurrency**: Single-key per-branch to cancel superseded runs
- **Environment validation**: Fast failure on missing required variables

## 9. Next Milestone
- Bulk generator + clustering polish

---
Updated automatically by Cursor on 2025-10-13T12:00:00.000Z
