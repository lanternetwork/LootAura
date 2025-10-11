This PR establishes the foundation needed to resume development:
- Restore missing `lootaura_v2` schema/tables with RLS, geom trigger, and indexes.
- Implement Option A: expose v2 via `public` updatable views and a public distance-search RPC.
- Switch app runtime to use public views/RPC (no schema switching; no legacy fallbacks).
- Seed minimal test data and verify /api/sales returns localized results.
- Wire reviews v1 (address_key + seller_id).
- Reset pagination defaults and smoke test.
- Branding sweep (text-only): remove "YardSaleFinder/YSF" strings.

Checklist (leave unchecked; tick as you complete):
- [ ] Apply/verify v2 schema (profiles, sales, items, favorites, reviews, zipcodes), RLS, geom trigger, indexes.
- [ ] Create public updatable views: `public.sales_v2`, `public.items_v2`, `public.favorites_v2`, `public.profiles_v2`.
- [ ] Add `public.search_sales_within_distance(...)` (SECURITY INVOKER) + `public.search_sales_bbox(...)` fallback.
- [ ] Update runtime to use public views/RPC only; remove any `db.schema('lootaura_v2')` calls and legacy yard_sales fallbacks.
- [ ] Seed ~10 sales across 3 cities; verify `/api/sales?lat=...&lng=...&distanceKm=40&limit=5` returns localized results with `durationMs` and `degraded:false`.
- [ ] Implement reviews v1 (address_key + seller_id), UI read/write, and Admin Tools probe.
- [ ] Pagination: default 24/page, stable ordering (distance, starts_at, id); "Load more" twice without dups.
- [ ] Branding sweep: no public-facing "YardSaleFinder/YSF".

Notes:
- Do NOT touch technical table names like `yard_sales` in migrations/history; only remove brand strings from UI/docs.
- Keep changes surgical; no re-architecture beyond Option A adoption.
