# Loot Aura Repository Status

## 1. Branch & Commit
- **Current branch:** milestone/db-option-a-restore
- **Latest commit:** e91a422 — fix(ui): address multiple UX issues - simple map pins, dropdown distance, connected filters, fixed map layout (by Yard Sale Tracker on 2025-10-05 21:22:25 -0400)
- **Active PR:** n/a
- **CI status:** running, last run: run 18267433089

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

## 8. Next Milestone
- Bulk generator + clustering polish

---
Updated automatically by Cursor on 2025-10-06T01:29:12.048Z
