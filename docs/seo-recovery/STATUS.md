# SEO Recovery — Status

**Last updated:** 2026-05-30

## Branch / PR

| Item | Value |
|------|-------|
| Branch | `fix/seo-recovery` |
| Original PR | #514 (merged without authorization — **reverted on main**) |
| Continuation PR | Open after revert (see GitHub) |
| `main` | Revert commit `21c2163e` — SEO changes **not** on main |

## Implementation complete (on branch)

- [x] Workstream A — Metro catalog (`T.sales` fix + root cause report)
- [x] Workstream D — Sitemap index (`app/sitemap.xml/route.ts`)
- [x] Unit tests — `metroDiscoveryQuery`, `buildSitemapIndexXml`

## Verification complete (preview only)

See `PREVIEW_VERIFICATION.md`. Summary:

| Workstream | Preview status |
|------------|----------------|
| A — Metro catalog | PASS |
| B — Geo pages | PASS (discovered metros) |
| C — Geo links | **PARTIAL** — 57/100 (43 residual) |
| D — Sitemap index | PASS |
| E — Qualified sitemaps | PASS |
| F — Listing regression | PASS |

## Still open before merge approval

- [ ] **Production verification** on `lootaura.com` after authorized merge + deploy
- [ ] **Admin API** — `GET /api/admin/seo/metro-inventory` with admin session (metro count proof)
- [ ] **Structured 20-metro page sample** on production
- [ ] **100-listing geo-link audit** on production
- [ ] **Integration tests** — city page, weekend page, sitemap index (spec testing section)
- [ ] **Workstream C decision** — 43/100 geo links dead due to discovery vs listing-sitemap filter footprint (separate fix or accept)

## Geo-link residual (Workstream C)

Listing sitemap: `status=published` only. Metro discovery: phase4 + `date_end` filters. Sales in sitemap but outside discovery footprint still emit geo links to dead city pages. Not fixed by schema repair; requires explicit scope decision.
