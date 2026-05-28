# Loot Aura SEO System

Inventory-first, ingestion-gated local discovery SEO. See the final development specification in the repository PR description and phased plan:

- **Phase 0** — Operational readiness + SEO index allowlist (`lib/seo/indexAllowlist.ts`)
- **Phase 1** — Metadata, structured data, gated sitemaps, operational dashboards
- **Phase 2** — SSR listing crawl block + pilot city pages (`/yard-sales/[metroSlug]`)
- **Phase 3** — Weekend inventory pages (`/yard-sales-this-weekend/[metroSlug]`, metro TZ)
- **Phase 4** — Internal linking + discovery graph (`lib/seo/geoLinking.ts`)
- **Phase 5** — Crawl validation + gated index rollout (`docs/SEO_PHASE5_CRAWL_VALIDATION.md`)
- **Phase 6** — Controlled metro expansion (`docs/SEO_PHASE6_METRO_EXPANSION.md`)

## Phase 1 module layout

| Path | Purpose |
|------|---------|
| `lib/seo/canonical.ts` | Canonical URLs from sale id / metro slug only |
| `lib/seo/metadata.ts` | City, weekend, listing metadata (default noindex) |
| `lib/seo/structuredData.ts` | Event, ItemList, BreadcrumbList, Place |
| `lib/seo/indexAllowlist.ts` | Index gates from YSTM Tier 1/2 + Phase 14 |
| `lib/seo/metroQualification.ts` | Pilot metro scoring |
| `lib/seo/sitemap/*` | Gated sitemap segments + chunking |
| `app/admin/ingestion/SeoOperationalPanel.tsx` | Admin SEO readiness dashboard |
| `app/yard-sales/[metroSlug]/page.tsx` | SSR city inventory pages (pilot metros) |
| `components/seo/SaleDetailSsrContent.tsx` | SSR listing crawl block |
| `components/seo/SeoSaleListItem.tsx` | Crawlable listing row for city pages |
| `lib/seo/fetchMetroInventory.ts` | Metro inventory query |
| `lib/seo/weekendBoundaries.ts` | Metro-local Sat–Sun window |
| `lib/seo/fetchMetroWeekendInventory.ts` | Weekend-filtered metro inventory |
| `app/yard-sales-this-weekend/[metroSlug]/page.tsx` | SSR weekend inventory pages |
| `lib/seo/geoLinking.ts` | Geographic discovery link graph |
| `components/seo/SeoGeoDiscoveryLinks.tsx` | City/weekend geo nav |
| `components/seo/SeoListingDiscoveryLinks.tsx` | Listing detail geo nav |

## Public indexing kill switch

Public indexing and listing sitemap inclusion require:

```bash
SEO_PUBLIC_INDEXING_ENABLED=true
```

Plus operational allowlist pass (Tier 1, Tier 2, Phase 14 enforcement, duplicate cluster bounds).

Until both pass, only the **static** sitemap segment is emitted.
