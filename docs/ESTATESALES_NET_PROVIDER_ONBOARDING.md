# EstateSales.NET provider onboarding

Implementation specification for adding EstateSales.NET (`estatesales_net`) as provider adapter #2 in LootAura’s multi-source ingestion platform.

## Status

- **Phase 0:** Feasibility — **3/3** (API capture verdict, list NGRX proof, overlap analysis in spec)
- **Phase 1:** List-level ingestion — **6/6** (parser, identity, persist wiring, bootstrap key, flag gate, tests/fixtures)
- **Phase 2:** Detail enrichment via SSR NGRX — **8/8** (capture doc, shared NGRX extract, detail parser, merge, enrichment fetch, persist queue, tests, code map below)
- **Phase 3:** Nationwide discovery and operational scaling after burn-in — **0/5** (not started)

## Principles

1. **Provider observations → sale-instance identity → shared publish pipeline** (not provider-as-truth).
2. **Reuse** publish worker, geocode, repair, refresh, audit, address lifecycle, sale-instance identity.
3. **List-first:** parse `NGRX_STATE` on metro pages; no headless browser by default.
4. **Retain observations** when publish is suppressed cross-provider; do not hard-drop provider rows.

## Provider identity

| Field | Value |
|-------|--------|
| `source_platform` | `estatesales_net` |
| `source_listing_id` | Numeric ES.net sale ID |
| Canonical URL | `https://www.estatesales.net/{STATE}/{City}/{ZIP}/{SALE_ID}` |
| List `parser_version` | `estatesales_net_list_v1` |

## Bootstrap

Shared orchestration columns (migration 208) with a **provider-scoped** state key:

```text
coverage_bootstrap_estatesales_net
```

Do not couple ES.net exit criteria to YSTM `coverage_bootstrap_nationwide` until burn-in completes.

## Feature flag

List ingest runs only when:

```text
ESNET_INGEST_ENABLED=true
```

No new Vercel/GitHub env vars are required in this PR; operators set the flag when ready.

## Code map

| Module | Role |
|--------|------|
| `lib/ingestion/estatesalesnet/constants.ts` | Platform id, parser versions, ingest gate |
| `lib/ingestion/estatesalesnet/parseEsnetNgrxListHtml.ts` | NGRX list parser |
| `lib/ingestion/estatesalesnet/parseEsnetNgrxDetailHtml.ts` | NGRX detail parser (Phase 2) |
| `lib/ingestion/estatesalesnet/attemptEsnetDetailEnrichment.ts` | Fetch detail HTML + merge |
| `lib/ingestion/estatesalesnet/computeEsnetSaleInstanceIdentity.ts` | Sale-instance fields |
| `lib/ingestion/estatesalesnet/esnetHosts.ts` | Host / URL helpers |
| `lib/ingestion/estatesalesnet/coverageBootstrapEstatesalesNet.ts` | Bootstrap state key |
| `lib/ingestion/adapters/externalPageSource.ts` | Routes parse + identity for `estatesales_net` |

## Phase 2 (complete)

Detail enrichment uses **SSR NGRX** on canonical sale URLs (see `docs/ESNET_API_CAPTURE.md`). Optional env `ESNET_DETAIL_ENRICH_CONCURRENCY` (default 4) bounds parallel detail fetches per list page. Rows enriched in persist set `parser_version` to `estatesales_net_detail_v1` and `raw_payload.detailPageParsed=true`.

REST `esnetApiClient.ts` remains deferred until `/api/saleDetails` is confirmed from a live browser capture.
