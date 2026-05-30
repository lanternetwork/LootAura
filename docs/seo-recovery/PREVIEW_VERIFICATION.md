# SEO Recovery — Preview Verification Report

**Date:** 2026-05-30 (final)  
**Environment:** Vercel preview (`fix/seo-recovery`)  
**URL:** https://loot-aura-git-fix-seo-recovery-lanternetworks-projects.vercel.app

---

## Workstream A — Metro Catalog Recovery

| Check | Result |
|-------|--------|
| Metro catalog non-empty | **PASS** — qualified `cities.xml` populated |
| Schema fix (`T.sales`) | **PASS** |
| Footprint aligned with listing sitemap | **PASS** — `applyPublishedSaleCityStateFootprint` |

---

## Workstream B — Geo Page Recovery

Sample: all metros in `cities.xml` (6–7 qualified slugs per deploy)

| Check | Result |
|-------|--------|
| City pages render | **PASS** — 6/6 sampled qualified metros |
| Weekend pages render | **PASS** (prior preview verification) |
| Catalog metros below qualification threshold | **PASS** — e.g. Toms River renders with content |

---

## Workstream C — Internal Geo-Link Recovery

| Check | Result |
|-------|--------|
| Emitted geo links resolve | **PASS** — listing page passes SEO metro catalog to `buildListingGeoLinks`; out-of-catalog metros omit links |
| 100-listing dead destinations | **PASS** — no emitted link targets a missing catalog metro |
| Catalog gating | Links derive from sale city/state but only render when slug ∈ `discoverSeoMetrosFromPublishedSales()` |

---

## Workstream D — Sitemap Index Repair

| Check | Result |
|-------|--------|
| `/sitemap.xml` | **PASS** — HTTP 200 |
| Segment references | **PASS** — static, listings-0, cities, weekends |
| `robots.txt` | Points to `https://lootaura.com/sitemap.xml` |

---

## Workstream E — Qualified Sitemap Recovery

| Check | Result |
|-------|--------|
| `cities.xml` | **PASS** — qualified metros only (6–7 URLs) |
| `weekends.xml` | **PASS** — matches qualification |
| Qualification bypass | **NONE** |

---

## Workstream F — Listing SEO Regression

| Check | Result |
|-------|--------|
| `meta robots` | **PASS** — `index, follow` |
| `data-seo-sale-detail="crawlable"` | **PASS** |
| `listings-0.xml` | **PASS** — 1000 URLs |

---

## Summary

| Workstream | Status |
|------------|--------|
| A | **PASS** |
| B | **PASS** |
| C | **PASS** |
| D | **PASS** |
| E | **PASS** |
| F | **PASS** (preview) |

Production re-verification required after authorized merge — see `PRODUCTION_VERIFICATION.md`.
