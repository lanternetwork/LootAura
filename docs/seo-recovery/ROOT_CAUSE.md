# Metro Discovery Root Cause Report

**Date:** 2026-05-30  
**Status:** Proven (code-path + production correlation)

---

## Summary

Production metro catalog generation returns an empty array because SEO inventory queries target `sales_v2` through the admin Supabase client scoped to `lootaura_v2`, while `sales_v2` exists only as **`public.sales_v2`** (a view over `lootaura_v2.sales`). PostgREST resolves `fromBase(admin, 'sales_v2')` to `lootaura_v2.sales_v2`, which does not exist. The query errors; `discoverSeoMetrosFromPublishedSales()` catches the failure and returns `[]`.

The working listing sitemap path uses `fromBase(admin, T.sales)` → `lootaura_v2.sales`, which is why listing sitemaps populate while city/weekend surfaces fail.

---

## Failing query

```typescript
// lib/seo/metroCatalog.ts — discoverSeoMetrosFromPublishedSales()
getAdminDb() // → admin.schema('lootaura_v2')
fromBase(admin, 'sales_v2').select('city, state')
```

Same table target in `lib/seo/fetchMetroInventory.ts`.

---

## Working reference query

```typescript
// lib/seo/sitemap/fetchPublishedListingRowsForSitemap()
getAdminDb()
fromBase(admin, T.sales).select('id, updated_at') // → lootaura_v2.sales
```

Production: `/sitemap/listings-0.xml` returns **1,000 URLs**.

---

## Expected vs actual row counts

| Path | Table resolved | Expected (prod) | Actual (prod) |
|------|----------------|-----------------|---------------|
| `fetchPublishedListingRowsForSitemap` | `lootaura_v2.sales` | >0 published rows | **1,000** in sitemap |
| `discoverSeoMetrosFromPublishedSales` | `lootaura_v2.sales_v2` (missing) | >0 distinct city/state pairs | **0** (error → `[]`) |
| `fetchMetroInventory` | `lootaura_v2.sales_v2` (missing) | per-metro rows | **0** (error → empty) |

Admin endpoint `GET /api/admin/seo/metro-inventory` would show `metros: []` when authenticated (401 without admin session during external audit).

---

## Exact failure reason

1. `getAdminDb()` sets schema to `lootaura_v2` (`lib/supabase/clients.ts`).
2. `sales_v2` is defined as `public.sales_v2` in migrations (view over `lootaura_v2.sales`), not in `lootaura_v2` schema.
3. PostgREST returns a relation-not-found / schema error.
4. `discoverSeoMetrosFromPublishedSales()` logs `[SEO_METRO_DISCOVERY] failed:` and **returns `[]`** (fail-silent).
5. City/weekend pages call `getSeoMetroBySlug(metros, slug)` → `undefined` → `notFound()`.
6. `cities.xml` / `weekends.xml` receive empty metro arrays → empty urlsets.

---

## Exact code path (city page failure)

```
GET /yard-sales/[metroSlug]
  → getSeoMetrosForRequest()
    → discoverSeoMetrosFromPublishedSales()
      → fromBase(admin, 'sales_v2')  // FAIL
      → return []
  → getSeoMetroBySlug([], slug)  // undefined
  → notFound()
```

Qualification, rollout gating, and inventory thresholds are **not** involved in page existence — only catalog membership.

---

## Sitemap index (Workstream D)

Separate defect: Next.js 15 `generateSitemaps()` serves child segments at `/sitemap/[id].xml` but `/sitemap.xml` index returns **404** in production (framework routing behavior). `robots.txt` references the broken URL.

Repair: explicit `app/sitemap.xml/route.ts` handler that emits a sitemap index referencing active segments.

---

## Repair approach

- Point metro discovery and metro inventory queries at `T.sales` (`lootaura_v2.sales`) — same base table as the working sitemap path.
- Preserve existing phase4 filters, date filters, and qualification logic unchanged.
- Add `/sitemap.xml` route handler for sitemap index.

No rollout, robots, qualification, or ingestion changes.

---

## Addendum — Geo-link footprint alignment (Workstream C)

After schema repair, preview audit showed **43/100** listing geo links still dead. Cause: metro discovery used phase4 + `date_end` filters while listing sitemap and geo links derive from all `status = published` sales with city/state.

**Repair:** `discoverSeoMetrosFromPublishedSales()` now uses the same published city/state footprint as the listing sitemap (`applyPublishedSaleCityStateFootprint`). City/weekend **page inventory** still uses phase4 + date filters via `fetchMetroInventory()` — qualification rules unchanged.

**Geo-link emission:** Listing pages pass the live metro catalog into `buildListingGeoLinks()`. `resolveSeoMetroForSale(sale, metros)` returns a metro only when the slug exists in the catalog, so emitted geo links always resolve.
