# SEO Phase 6 — Controlled Metro Expansion

Phase 6 adds **tier-2 expansion candidates** beyond the initial five pilot metros. New city/weekend surfaces are never mass-generated: ops activates metros explicitly and the same ingestion-derived qualification matrix gates indexing.

## Pilot metros (always active)

Dallas, Phoenix, Nashville, Atlanta, Houston — defined in `lib/seo/pilotMetros.ts`. SSR pages always exist (default `noindex` until Phase 5 rollout env).

## Expansion candidates

Tier-2 markets in `lib/seo/expansionMetros.ts` (Austin, Charlotte, Denver, Orlando, Tampa, San Antonio). They appear on the admin SEO dashboard with live inventory counts but **no public routes** until activated.

## Activate an expansion metro

Set or extend:

```bash
SEO_EXPANSION_METRO_SLUGS=austin-tx,charlotte-nc
```

Redeploy. This enables:

- `/yard-sales/{slug}` and `/yard-sales-this-weekend/{slug}` SSR pages (still `noindex` until index rollout env)
- Eligibility for sitemap city/weekend segments when qualified + rollout env passes
- Geo discovery links when inventory exists

## Qualification (scoreboard-gated)

Same rules as pilots (`lib/seo/metroQualification.ts`):

- National SEO allowlist pass
- `activeListingCount >= minActiveListings` (25)
- `crawlableInventoryPct >= 85%`
- Freshness timestamp present

Index rollout still requires Phase 5 env attestation and optional `SEO_INDEX_PILOT_METROS` gradual allowlist.

## Admin tooling

- **Dashboard:** Ingestion overview → SEO operational readiness (live inventory via `GET /api/admin/seo/metro-inventory`)
- **Expansion table:** Shows pilot vs candidate vs active expansion with qualification scores

## Rollback

Remove slug from `SEO_EXPANSION_METRO_SLUGS` and redeploy — routes 404, sitemap entries drop on next generation.
