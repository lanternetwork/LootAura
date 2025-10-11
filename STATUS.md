# Loot Aura Repository Status

## 1. Branch & Commit
- **Current branch:** milestone/db-option-a-restore
- **Latest commit:** 95aaab9 — Merge branch 'milestone/db-option-a-restore' of https://github.com/lanternetwork/LootAura into milestone/db-option-a-restore (by Yard Sale Tracker on 2025-10-10 20:57:59 -0400)
- **Active PR:** n/a
- **CI status:** running, last run: run 18421986922

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

## 7. Date Range Filter — Repair
- **Behavior**: Date filters work as narrowing constraints under MAP authority
- **Authority Model**: MAP remains source of truth; date changes only trigger markers fetch
- **Sequencing**: Date changes bump viewportSeqRef to ensure stale responses are dropped
- **API Support**: Both /api/sales and /api/sales/markers accept from/to parameters
- **Overlap Logic**: Sale window [starts_at, ends_at] overlaps [fromUtc, toUtc] inclusively
- **Limitations**: No wide /api/sales queries under MAP authority; date filtering is server-side only

## 8. Known Issues / TODO
- Apply 032/033 migrations to restore lootaura_v2 schema
- Apply 034 public views/RPC and verify grants
- Wire /api/sales fully to Option A RPC, confirm degraded flag
- Seed minimal data (Louisville, Nashville, Atlanta) and verify counts
- Consider marker clustering for dense maps

## 9. Next Milestone
- Bulk generator + clustering polish

---
Updated automatically by Cursor on 2025-10-11T00:58:42.324Z
