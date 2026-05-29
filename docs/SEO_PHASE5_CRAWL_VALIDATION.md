# Phase 5 — Crawl validation and index rollout

## Overview

Phase 5 adds HTTP crawl smoke checks and admin attestations before public indexing. Rollout state is stored in `ingestion_orchestration_state` key `seo_rollout` (not env vars).

## Crawl smoke

`GET /api/admin/seo/crawl-smoke?metroSlug=dallas-tx&saleId=<uuid>`

- `lib/seo/crawlSmoke.ts` — same-origin fetches for city, weekend, listing, and static sitemap HTML markers
- `metroSlug` must match a metro discovered from published inventory (defaults to first discovered metro)
- `saleId` optional; otherwise uses latest published sale

After smoke passes, attest **Crawl validation** in the admin SEO panel.

## Index rollout gates

Public indexing requires:

1. Operational allowlist pass (`evaluateSeoIndexAllowlist` — Tier 1, Tier 2, Phase 14, etc.)
2. Admin attestations: public indexing, crawl validation, Search Console validation
3. At least one metro qualified via `qualifyMetroForSeoRollout` (inventory thresholds)

Index rollout applies to **all discovered metros** that pass operational qualification — no pilot or expansion allowlists.

## Robots

- Listings: `resolveListingIndexRobots(rolloutState)`
- Metro pages: `resolveMetroPageRobots(metro, rolloutState, inventory, nationalIndexingAllowed)`

Fail-closed: missing attestations or failed metro qualification → `noindex, follow`.
