# SEO Recovery — Preview Verification Report

**Date:** 2026-05-30  
**Environment:** Vercel preview (`fix/seo-recovery`)  
**URL:** https://loot-aura-git-fix-seo-recovery-lanternetworks-projects.vercel.app

Production verification pending post-merge deploy to `lootaura.com`.

---

## Workstream A — Metro Catalog Recovery

| Check | Result |
|-------|--------|
| Metro catalog non-empty | **PASS** — `cities.xml` has 7 qualified metros; catalog metros render (e.g. Toms River with 5 listings) |
| Root cause fix | **PASS** — `sales_v2` → `T.sales` restores discovery |

---

## Workstream B — Geo Page Recovery

Sample: 7 qualified metros from `cities.xml` + additional catalog metros

| Metro | City page | Weekend page |
|-------|-----------|--------------|
| `/yard-sales/louisville-ky` | **PASS** — 39 listings, proper title | **PASS** |
| `/yard-sales/millville-nj` | **PASS** — 83 listings | **PASS** |
| `/yard-sales/toms-river-nj` | **PASS** — 5 listings (below qualification) | **PASS** |
| `/yard-sales/eatontown-nj` | **FAIL** — not in catalog (generic title, no content) | **FAIL** |

**Note:** Pages render for all metros returned by discovery. Slugs with no matching discovery footprint still soft-404 (pre-existing filter asymmetry vs listing sitemap).

---

## Workstream C — Internal Geo-Link Recovery

Sample: 100 listings from `listings-0.xml`

| Metric | Result |
|--------|--------|
| Listings with geo links | 100 / 100 |
| City link resolves (catalog metro) | **57 / 100 PASS** |
| City link dead (metro absent from catalog) | **43 / 100 FAIL** |
| Qualified-metro geo links only | **15 / 15 PASS** (0 broken) |

**Residual gap:** Listing sitemap includes `status=published` sales without date filters; metro discovery applies phase4 + `date_end` filters. Published sales linking to metros with no discovery footprint still produce dead geo links. This is existing architecture tension — not introduced by this repair. Resolving requires a separate decision (filter alignment or conditional geo-link emission).

---

## Workstream D — Sitemap Index Repair

| Check | Result |
|-------|--------|
| `/sitemap.xml` | **PASS** — HTTP 200 |
| References segments | **PASS** — static, listings-0, cities, weekends |
| `robots.txt` sitemap URL | Points to `https://lootaura.com/sitemap.xml` (correct for production) |

---

## Workstream E — Qualified Sitemap Recovery

| Check | Result |
|-------|--------|
| `cities.xml` | **PASS** — 7 URLs (qualified metros only) |
| `weekends.xml` | **PASS** — 7 URLs |
| Qualification bypass | **NONE** — empty for non-qualified metros by design |

---

## Workstream F — Listing SEO Regression

| Check | Result |
|-------|--------|
| `meta robots` | **PASS** — `index, follow` |
| `data-seo-sale-detail="crawlable"` | **PASS** |
| `listings-0.xml` | **PASS** — 1000 URLs unchanged |

---

## Summary

| Workstream | Status |
|------------|--------|
| A — Metro catalog | **PASS** |
| B — Geo pages | **PASS** (for discovered metros) |
| C — Geo links | **PARTIAL** — 57/100; 43 residual from filter footprint mismatch |
| D — Sitemap index | **PASS** |
| E — Qualified sitemaps | **PASS** |
| F — Listing regression | **PASS** |

**Recommendation:** Merge and verify on production. Track geo-link residual (43/100) as follow-up if zero broken destinations is a hard launch gate.
