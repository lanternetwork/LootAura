# SEO Phase 6 — Controlled Metro Expansion

Phase 6 adds **tier-2 expansion candidates** beyond the initial five pilot metros. New city/weekend surfaces are never mass-generated: ops activates metros via **code promotion** and the same ingestion-derived qualification matrix gates indexing.

## Pilot metros (always active)

Dallas, Phoenix, Nashville, Atlanta, Houston — defined in `lib/seo/pilotMetros.ts`. SSR pages always exist (default `noindex` until Phase 5 rollout attestations).

## Expansion candidates

Tier-2 markets in `SEO_EXPANSION_METRO_CANDIDATES` (`lib/seo/expansionMetros.ts`). They appear on the admin SEO dashboard with live inventory counts but **no public routes** until promoted.

## Activate an expansion metro (code promotion)

Move the metro definition from `SEO_EXPANSION_METRO_CANDIDATES` into `SEO_ACTIVE_EXPANSION_METROS` in `lib/seo/expansionMetros.ts`, then deploy. This enables:

- `/yard-sales/{slug}` and `/yard-sales-this-weekend/{slug}` SSR pages (still `noindex` until index rollout attestations)
- Eligibility for sitemap city/weekend segments when qualified + rollout attestations pass
- Geo discovery links when inventory exists

No Vercel env vars.

## Qualification (scoreboard-gated)

Same rules as pilots (`lib/seo/metroQualification.ts`):

- National SEO allowlist pass
- `activeListingCount >= minActiveListings` (25)
- `crawlableInventoryPct >= 85%`
- Freshness timestamp present

Index rollout still requires Phase 5 admin attestations on the ingestion dashboard.

## Admin tooling

- **Dashboard:** Ingestion overview → SEO operational readiness (live inventory via `GET /api/admin/seo/metro-inventory`)
- **Expansion table:** Shows pilot vs candidate vs active expansion with qualification scores

## Rollback

Remove the metro from `SEO_ACTIVE_EXPANSION_METROS` and redeploy — routes 404, sitemap entries drop on next generation.
