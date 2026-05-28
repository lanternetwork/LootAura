# Loot Aura SEO System

Inventory-first, ingestion-gated local discovery SEO. See the final development specification in the repository PR description and phased plan:

- **Phase 0** — Operational readiness + SEO index allowlist (`lib/seo/indexAllowlist.ts`)
- **Phase 1** — Metadata, structured data, gated sitemaps, operational dashboards (this module)
- **Phase 2+** — SSR city/listing surfaces, weekend pages, linking, validation, expansion

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

## Public indexing kill switch

Public indexing and listing sitemap inclusion require:

```bash
SEO_PUBLIC_INDEXING_ENABLED=true
```

Plus operational allowlist pass (Tier 1, Tier 2, Phase 14 enforcement, duplicate cluster bounds).

Until both pass, only the **static** sitemap segment is emitted.
