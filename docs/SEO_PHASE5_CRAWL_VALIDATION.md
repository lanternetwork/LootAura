# SEO Phase 5 — Crawl + Index Validation

Phase 5 gates **public indexing** and **sitemap expansion** beyond Phase 0/1 infrastructure. Engineering ships crawlable SSR surfaces in Phases 2–4; Phase 5 is operational attestation that crawlers and Search Console behave correctly before removing `noindex`.

## Prerequisites (do not skip)

1. Ingestion dashboard **SEO operational readiness** shows Tier 1, Tier 2, and Phase 14 gates passing.
2. Set `SEO_PUBLIC_INDEXING_ENABLED=true` only after operational allowlist is green.
3. Pilot metros meet inventory qualification on the dashboard (live counts wired when available).

## Phase 5A — Search Console validation

Manual checklist (record in ops ticket before enabling env):

- [ ] Property verified in Google Search Console
- [ ] Submit `sitemap/static.xml` only while rollout env is partial; add listing/city/weekend segments only after full rollout env
- [ ] URL Inspection on one listing (`/sales/{saleId}`): **Crawled** / fetchable, canonical matches `/sales/{saleId}`
- [ ] URL Inspection on one city page (`/yard-sales/{slug}`): inventory links visible in rendered HTML
- [ ] URL Inspection on one weekend page (`/yard-sales-this-weekend/{slug}`)
- [ ] No unexpected `noindex` on pages intended to index (after rollout env enabled)
- [ ] Structured data: Event / ItemList / BreadcrumbList valid in Rich Results test (warnings acceptable if non-blocking)
- [ ] Coverage report: no mass duplicate canonical or soft-404 spikes after pilot index

When complete, set:

```bash
SEO_SEARCH_CONSOLE_VALIDATION_PASSED=true
```

## Phase 5B — Crawl / HTML validation

Automated smoke (admin):

```http
GET /api/admin/seo/crawl-smoke?metroSlug=dallas-tx&saleId={publishedSaleId}
```

Optional env for CI/cron:

```bash
SEO_CRAWL_SMOKE_SALE_ID={publishedSaleId}
```

Checks:

- City page HTTP 200, H1, `/sales/` links in raw HTML
- Weekend page HTTP 200, `/sales/` links in raw HTML
- Listing page `data-seo-sale-detail="crawlable"` when `saleId` provided
- Static sitemap has no query-parameter URLs

When all checks pass, set:

```bash
SEO_CRAWL_VALIDATION_PASSED=true
```

## Index rollout (removes default noindex)

All three env vars must be `true`:

| Variable | Purpose |
|----------|---------|
| `SEO_PUBLIC_INDEXING_ENABLED` | Phase 0 master opt-in |
| `SEO_CRAWL_VALIDATION_PASSED` | Phase 5B attestation |
| `SEO_SEARCH_CONSOLE_VALIDATION_PASSED` | Phase 5A attestation |

Optional gradual metro rollout:

```bash
SEO_INDEX_PILOT_METROS=dallas-tx,phoenix-az
```

Omit to allow all qualified pilot metros when national rollout is enabled.

## What changes when rollout is enabled

- Listing, city, and weekend metadata use `index, follow` (subject to metro allowlist)
- Sitemaps include listing chunks plus `cities` and `weekends` segments
- **Still requires** operational allowlist on dashboard before ops should enable env vars

## Rollback

Unset any rollout env var (fastest: `SEO_PUBLIC_INDEXING_ENABLED=false`). Pages return to `noindex`; sitemaps collapse to `static` only.
