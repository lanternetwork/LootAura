# Loot Aura SEO System — Final Development Specification

See repository PR for implementation status. This document is the authoritative phased specification.

## Objective

Build a scalable, ingestion-driven local discovery SEO engine that compounds through geographic expansion, inventory freshness, recurring weekend intent, local search capture, ingestion quality, and map-centric discovery behavior.

The core SEO asset is structured, geographically indexed, constantly refreshed local inventory. The SEO system functions as a thin projection layer over ingestion health, canonical convergence, marketplace quality, geographic density, and freshness.

This is NOT: content marketing, mass page generation, AI-generated content SEO, or thin programmatic geo spam.

## Phases

- **Phase 0** — Operational readiness + SEO allowlist (indexing blocked until gates pass)
- **Phase 1** — SEO infrastructure foundation (metadata, structured data, gated sitemaps, dashboards) — **implemented in this PR**
- **Phase 2** — Crawlable SSR inventory surfaces (listing + city pages)
- **Phase 3** — Weekend inventory surfaces (metro timezone boundaries)
- **Phase 4** — Internal linking + discovery graph
- **Phase 5** — Crawl + index validation (Search Console, raw HTML checks) — see `docs/SEO_PHASE5_CRAWL_VALIDATION.md`
- **Phase 6** — Nationwide metro participation (operational gates only) — see `docs/SEO_PHASE6_METRO_EXPANSION.md`
- **Phase 7** — Local discovery distribution (manual pilot) — see `docs/SEO_PHASE7_LOCAL_DISCOVERY_DISTRIBUTION.md`

## Phase 0 — Critical rule

Phase 0 blocks public indexing, sitemap inclusion, and Search Console rollout. It does NOT block engineering implementation, staging pages, noindex pilots, or internal crawl validation.

SEO index allowlist must derive from existing ingestion gates (Tier 1, Tier 2 failures, Phase 14, duplicate clusters, coverage, repair, freshness). Do not create parallel SEO-only gate systems.

## Phase 1 — Deliverables (this PR)

### 1A — Metadata + canonical infrastructure

Canonical URLs derive only from canonical sale identity, convergence truth, and supersession rules. Listing identity is `/sales/{saleId}`.

### 1B — Structured data

Event, ItemList, BreadcrumbList, Place for listing, city, and weekend surfaces.

### 1C — Sitemap infrastructure

Separate segments: static, listings (chunked), cities and weekends (gated, empty until Phase 2/3). Never include query-parameter or map-state URLs.

### 1D — SEO operational dashboards

Track indexed metros, crawlable inventory %, stale %, canonical coverage, duplicate clusters, sitemap counts, freshness trends.

## Rollout configuration (no SEO env vars)

- **Public indexing, crawl validation, Search Console** — admin attestations in `ingestion_orchestration_state` key `seo_rollout` (`POST /api/admin/seo/rollout-state`).
- **Metro discovery** — `discoverSeoMetrosFromPublishedSales()` in `lib/seo/metroCatalog.ts` (nationwide; no allowlists).
- **Metro participation** — `evaluateSeoMetroParticipation()` / `qualifyMetroForSeoRollout()` (operational gates only).
- **Crawl smoke listing** — `?saleId=` query param or latest published sale from DB.
- **Canonical origin** — existing `NEXT_PUBLIC_SITE_URL` only (predates SEO).

## Deferred

Neighborhood SEO, autonomous posting, AI article systems, mass geo permutations, thin near-me pages, broad national expansion, generic blog/content marketing.

## Long-term goal

Loot Aura becomes the dominant geographically indexed discovery engine for local resale events.
