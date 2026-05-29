# SEO Phase 7 — Local Discovery Distribution (Manual Pilot)

Phase 7 adds **operator-generated distribution packs** for human-reviewed posting to local channels. There is **no** automated posting, scheduling, or social API integration.

## Purpose

Share live metro inventory summaries on:

- Reddit (city or weekend threads)
- Local Facebook groups
- Email digests (weekly “what’s happening this weekend”)

Content derives from the same live inventory queries as SEO city/weekend pages.

## Eligibility gates

A pack generates only when:

1. Metro is **active** (pilot or `SEO_EXPANSION_METRO_SLUGS`)
2. Metro passes the **same qualification matrix** as SEO (`lib/seo/metroQualification.ts`)
3. National ops allowlist is evaluated server-side via the same admin ingestion metrics + coverage handlers used by the SEO dashboard (`evaluateSeoIndexAllowlist`)
4. Weekend surfaces require non-zero weekend inventory in the metro timezone window

If blockers appear, fix ingestion/SEO gates before distributing.

## Admin workflow

1. Open **Admin → Ingestion → Overview → SEO operational readiness**
2. In **Phase 7 — local discovery distribution**, choose metro + channel
3. Click **Generate pack** → review copy
4. **Copy for paste** → post manually after human edit
5. Do not post to low-density, stale, or unqualified metros

## API (admin only)

```http
GET /api/admin/seo/distribution-pack?metroSlug=dallas-tx&surface=reddit_weekend
```

`surface` values: `reddit_city`, `reddit_weekend`, `facebook_city`, `facebook_weekend`, `digest_email`

Links include UTM parameters: `utm_source=local_discovery`, `utm_medium=manual`, `utm_campaign=seo_{surface}`.

## Rules (from spec)

Do **not** distribute:

- Generic AI filler or synthetic local content
- Summaries for unqualified / inactive metros
- Stale or empty inventory snapshots
- Spam-style geo blasts

Initial rollout remains **human-reviewed** and **manually distributed**.

## Module layout

| Path | Purpose |
|------|---------|
| `lib/seo/distribution/buildMetroDistributionPack.ts` | Pack title/body from inventory |
| `lib/seo/distribution/evaluateDistributionEligibility.ts` | Shared SEO gates |
| `lib/seo/distribution/buildDistributionUrls.ts` | UTM-tagged canonical links |
| `app/api/admin/seo/distribution-pack/route.ts` | Admin API |
| `app/admin/ingestion/SeoDistributionPilotPanel.tsx` | Dashboard UI |
