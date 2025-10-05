# Loot Aura Repository Status

## 1. Branch & Commit
- **Current branch:** milestone/db-option-a-restore
- **Latest commit:** 8114b59 — feat(map): show all sale pins within radius via markers API and hook (by LootAura DevBot)
- **Active PR:** n/a
- **CI status:** unknown

## 2. Database Schema
- **Schema:** lootaura_v2
- **Tables present:** profiles, sales, items, favorites, reviews, zipcodes (status: unknown)
- **RLS:** status unknown per table
- **Geom & PostGIS:** status unknown (GIST index, trigger)
- **Last applied migrations:** unknown

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
- **Mock/Seed data count:** unknown
- **Admin Tools:** present; depend on schema

## 5. Frontend & UX
- **Map behavior:** ✅ full-radius pins via markers API (server cap; no clustering yet)
- **Responsiveness:** mobile/tablet friendly
- **Accessibility score:** not measured
- **Branding:** Loot Aura mostly applied; verify no YardSaleFinder remnants

## 6. Deployments
- **Vercel URLs:** Production/Preview (insert)
- **Environment vars:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, etc. (verify)
- **Last deploy health:** unknown

## 7. Known Issues / TODO
- Apply 032/033 migrations; restore lootaura_v2
- Apply 034 views/RPC; verify grants
- Wire /api/sales fully to Option A RPC; confirm degraded flag
- Seed minimal data (Louisville, Nashville, Atlanta)
- Consider marker clustering

## 8. Next Milestone
- Bulk generator + clustering polish

---
Updated automatically by Cursor on 2025-10-05T00:00:00.000Z
