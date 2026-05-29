# SEO Phase 5 — Crawl + Index Validation

Phase 5 gates **public indexing** and **sitemap expansion** beyond Phase 0/1 infrastructure. Engineering ships crawlable SSR surfaces in Phases 2–4; Phase 5 is operational attestation that crawlers and Search Console behave correctly before removing `noindex`.

Rollout controls are stored in `ingestion_orchestration_state` (key `seo_rollout`) — **no Vercel env vars**.

## Prerequisites (do not skip)

1. Ingestion dashboard **SEO operational readiness** shows Tier 1, Tier 2, and Phase 14 gates passing.
2. Enable **Public indexing** in the admin SEO panel only after operational allowlist is green.
3. Pilot metros meet inventory qualification on the dashboard (live counts wired when available).

## Phase 5A — Search Console validation

Manual checklist (record in ops ticket before attesting in admin):

- [ ] Property verified in Google Search Console
- [ ] Submit `sitemap/static.xml` only while rollout attestations are partial; add listing/city/weekend segments only after full rollout attestations
- [ ] URL Inspection on one listing (`/sales/{saleId}`): **Crawled** / fetchable, canonical matches `/sales/{saleId}`
- [ ] URL Inspection on one city page (`/yard-sales/{slug}`): inventory links visible in rendered HTML
- [ ] URL Inspection on one weekend page (`/yard-sales-this-weekend/{slug}`)
- [ ] No unexpected `noindex` on pages intended to index (after rollout attestations enabled)
- [ ] Structured data: Event / ItemList / BreadcrumbList valid in Rich Results test (warnings acceptable if non-blocking)
- [ ] Coverage report: no mass duplicate canonical or soft-404 spikes after pilot index

When complete, use the ingestion dashboard **Search Console** control or:

```http
POST /api/admin/seo/rollout-state
{ "target": "search_console", "enabled": true }
```

## Phase 5B — Crawl / HTML validation

Automated smoke (admin):

```http
GET /api/admin/seo/crawl-smoke?metroSlug=dallas-tx&saleId={publishedSaleId}
```

Omit `saleId` to use the latest published listing from the database.

Checks:

- City page HTTP 200, H1, `/sales/` links in raw HTML
- Weekend page HTTP 200, `/sales/` links in raw HTML
- Listing page `data-seo-sale-detail="crawlable"` when `saleId` provided or auto-resolved
- Static sitemap has no query-parameter URLs

When all checks pass, attest in admin (**Crawl validation**) or:

```http
POST /api/admin/seo/rollout-state
{ "target": "crawl_validation", "enabled": true }
```

## Index rollout (removes default noindex)

All three admin attestations must be enabled:

| Control | Purpose |
|---------|---------|
| Public indexing | Phase 0 master opt-in |
| Crawl validation | Phase 5B attestation |
| Search Console | Phase 5A attestation |

Index rollout applies to **code-active metros** (`SEO_PILOT_METROS` plus `SEO_ACTIVE_EXPANSION_METROS` in `expansionMetros.ts`).

## What changes when rollout is enabled

- Listing, city, and weekend metadata use `index, follow` for active qualified metros
- Sitemaps include listing chunks plus `cities` and `weekends` segments
- **Still requires** operational allowlist on dashboard before ops should enable attestations

## Rollback

Disable **Public indexing** in the admin SEO panel (fastest). Pages return to `noindex`; sitemaps collapse to `static` only.

```http
POST /api/admin/seo/rollout-state
{ "target": "public_indexing", "enabled": false }
```
