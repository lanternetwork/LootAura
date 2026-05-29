# Phase 6 — Nationwide metro participation

Phase 6 no longer uses pilot lists, expansion candidates, or code-promoted metros.

## Model

```text
Discover metros from published sales (city + state → slug)
→ Score each metro with qualifyMetroForSeoRollout
→ Participate when national operational gates pass AND metro inventory thresholds pass
```

Implementation:

- `lib/seo/metroCatalog.ts` — `discoverSeoMetrosFromPublishedSales()`
- `lib/seo/metroParticipation.ts` — `evaluateSeoMetroParticipation()`
- `lib/seo/metroQualification.ts` — per-metro scoring (inventory + national gates)

## Admin dashboard

`SeoOperationalPanel` shows every discovered metro with live inventory, qualification score, and blockers. There is no deploy step to “activate” a metro.

## Public routes

`/yard-sales/[metroSlug]` and `/yard-sales-this-weekend/[metroSlug]` use `dynamicParams = true`. A slug is served when it appears in the published-sales footprint; otherwise the route returns 404.

Robots and sitemap inclusion follow `resolveMetroPageRobots` and sitemap builders — operational gates only, no allowlist.
