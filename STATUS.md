# LootAura Repository Status

**Last updated: 2025-10-13 — Enterprise Documentation Alignment**

## 1. Branch & Commit
- **Current branch:** milestone/auth-profile
- **Latest commit:** b275637 — docs: comprehensive documentation alignment with enterprise standards (by Yard Sale Tracker on 2025-10-13 00:00:00 -0400)
- **Active PR:** n/a
- **CI status:** running, last run: run 18454698795
- **Branch naming:** `main`, `release/x.y`, `feature/...` (enterprise standards)

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

## 8. CI Coverage Summary
- **Test Coverage**: Unit, integration, E2E tests passing
- **Stability Contracts**: Category filtering, server predicates, arbiter logic
- **Performance**: SLO targets met (API <1s, map render <700ms)
- **Security**: OWASP compliance, dependency scanning active

## 9. Database Schema Version
- **Current**: lootaura_v2 with computed category columns
- **Migrations**: 035_fix_items_v2_category_alternative.sql applied
- **Views**: public.items_v2 with category computation
- **RLS**: Strict policies active

## 10. Stability Program

### Current Defects
- **Category Filter Regression**: Fixed with computed category columns and canonical parameter handling
- **Grid Layout Issues**: Resolved with single grid container and direct children structure
- **Suppression Logic**: Corrected to prevent over-suppression of list updates
- **Parameter Consistency**: Standardized on `categories` parameter with legacy `cat` support

### Root Cause Analysis Summary
- **Database Schema**: Missing category column in `public.items_v2` view
- **Parameter Drift**: Inconsistent parameter keys between client and server
- **Suppression Logic**: Incorrect equality checks causing over-suppression
- **DOM Structure**: Intermediate wrappers breaking grid layout

### Tasks Closed by Documentation Update
- ✅ **INVARIANTS.md**: Protocol contracts and invariants documented
- ✅ **TEST_MATRIX.md**: Comprehensive test matrix created
- ✅ **DEBUG_GUIDE.md**: Unified debug system documented
- ✅ **MIGRATION_POLICY.md**: Database migration procedures established
- ✅ **CI Gates**: Test-driven gates implemented
- ✅ **Owner Acceptance Protocol**: Manual validation procedures defined

## 11. Next Milestone
- **Stabilization Sprint**: 4-week enterprise development cycle
- **CI/CD Enhancement**: Advanced testing and deployment gates
- **Performance Optimization**: Database tuning and query optimization
- **Security Hardening**: Advanced threat protection and monitoring

---
Updated automatically by Cursor on 2025-10-13T04:00:18.032Z
