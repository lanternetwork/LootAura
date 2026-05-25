# EstateSales.NET provider onboarding

Implementation specification for adding EstateSales.NET (`estatesales_net`) as provider adapter #2 in LootAura’s multi-source ingestion platform.

## Status

- **Phase 0:** Feasibility — **3/3** (API capture verdict, list NGRX proof, overlap analysis in spec)
- **Phase 1:** List-level ingestion — **6/6** (parser, identity, persist wiring, bootstrap key, flag gate, tests/fixtures)
- **Phase 2:** Detail enrichment via SSR NGRX — **8/8** (capture doc, shared NGRX extract, detail parser, merge, enrichment fetch, persist queue, tests, code map below)
- **Phase 3:** Nationwide discovery and operational scaling — **5/5**
- **Phase 4:** Operations burn-in — **6/6**
- **Phase 5:** DB runtime control + provider cadence — **8/8**

## Principles

1. **Provider observations → sale-instance identity → shared publish pipeline** (not provider-as-truth).
2. **Reuse** publish worker, geocode, repair, refresh, audit, address lifecycle, sale-instance identity.
3. **List-first:** parse `NGRX_STATE` on metro pages; no headless browser by default.
4. **Retain observations** when publish is suppressed cross-provider; do not hard-drop provider rows.
5. **No Vercel env toggles** for ES.net operations — runtime control is DB-backed via admin UI.

## Provider identity

| Field | Value |
|-------|--------|
| `source_platform` | `estatesales_net` |
| `source_listing_id` | Numeric ES.net sale ID |
| Canonical URL | `https://www.estatesales.net/{STATE}/{City}/{ZIP}/{SALE_ID}` |
| List `parser_version` | `estatesales_net_list_v1` |

## Runtime control (DB)

Two independent keys in `ingestion_orchestration_state` (migration **211**):

| Key | Purpose | Auto-disable |
|-----|---------|--------------|
| `esnet_ingest_enabled` | Provider list/detail persist + ingest lane | **Never** — admin only |
| `esnet_bootstrap_enabled` | Temporary burst crawl budgets | **Yes** — exit criteria in `esnetCoverageBootstrapExit.ts` |

Legacy key `coverage_bootstrap_estatesales_net` (migration 209) is read as a bootstrap fallback only.

Admin API: `POST /api/admin/ingestion/coverage-bootstrap` with `{ "enabled": boolean, "target": "ingest" | "bootstrap" | "nationwide" }`.

## Provider cadence (code defaults)

ES.net does **not** use the YSTM two-minute ingest cadence or `INGESTION_ORCHESTRATION_*` env budgets.

| Lane | Normal | Bootstrap burst |
|------|--------|-----------------|
| Ingest min interval | 360 min | 120 min |
| Config batch | 18 | 45 |
| Execution budget | 90s | 150s |
| Domain spacing | 800ms | 500ms |

Discovery runs on shared `/api/cron/discovery` at **02/08/14/20 UTC** only (`esnetDiscoveryCadence.ts`) — ~4×/day, not every cron tick.

Metro list crawl order uses `esnetAdaptiveRefreshPolicy.ts` (sale-window tiers: daily → 12h → 4h → 2h active; expired metros skipped).

## Code map

| Module | Role |
|--------|------|
| `lib/ingestion/estatesalesnet/constants.ts` | Platform id, parser versions |
| `lib/ingestion/estatesalesnet/esnetOrchestrationState.ts` | DB ingest + bootstrap state |
| `lib/ingestion/estatesalesnet/esnetIngestionOrchestrationDefaults.ts` | Code-only ingest budgets |
| `lib/ingestion/estatesalesnet/esnetIngestCadence.ts` | Ingest lane throttle (`esnet_ingest_lane`) |
| `lib/ingestion/estatesalesnet/esnetDiscoveryCadence.ts` | Discovery hour gating |
| `lib/ingestion/estatesalesnet/esnetAdaptiveRefreshPolicy.ts` | Sale-window crawl prioritization |
| `lib/ingestion/estatesalesnet/parseEsnetNgrxListHtml.ts` | NGRX list parser |
| `lib/ingestion/estatesalesnet/parseEsnetNgrxDetailHtml.ts` | NGRX detail parser |
| `lib/ingestion/estatesalesnet/runEsnetPlatformIngestionCronBatch.ts` | Daily cron ingest lane |
| `lib/ingestion/estatesalesnet/esnetCoverageBootstrapExit.ts` | Bootstrap-only auto-disable |
| `lib/ingestion/adapters/externalPageSource.ts` | Routes parse + identity for `estatesales_net` |

## Operator checklist

1. Apply migrations **209**, **210**, **211**.
2. Let discovery seed `ingestion_city_configs` with `source_platform=estatesales_net`.
3. Enable **provider ingestion** from the ingestion dashboard (`target: ingest`) — no deploy.
4. Optionally enable **burst bootstrap** (`target: bootstrap`) for higher crawl budgets.
5. Monitor scoreboard fields `esnetIngest` / `esnetBootstrap` and daily telemetry (`esnetInserted`, detail enrichment counters).

## Phase 2 (complete)

Detail enrichment uses **SSR NGRX** on canonical sale URLs (see `docs/ESNET_API_CAPTURE.md`). Optional env `ESNET_DETAIL_ENRICH_CONCURRENCY` (default 4) bounds parallel detail fetches per list page. Rows enriched in persist set `parser_version` to `estatesales_net_detail_v1` and `raw_payload.detailPageParsed=true`.

REST `esnetApiClient.ts` remains deferred until `/api/saleDetails` is confirmed from a live browser capture.

## Phase 3 (complete)

Nationwide metro discovery from state indexes, promotion, daily cron lane, discovery orchestration key `source_discovery_estatesales_net`.

## Phase 4 (complete)

Admin bootstrap panel, ES.net discovery revalidation, platform adapters, scoreboard telemetry.

## Phase 5 (complete)

| # | Deliverable |
|---|-------------|
| 1 | Remove `ESNET_INGEST_ENABLED` env gating |
| 2 | `esnet_ingest_enabled` + `esnet_bootstrap_enabled` DB keys (migration 211) |
| 3 | Admin UI: separate ingest vs bootstrap toggles |
| 4 | Ingest/bootstrap never auto-disable (bootstrap exit only) |
| 5 | ES.net-specific ingest budgets + cadence throttle |
| 6 | Discovery 4×/day hour gating |
| 7 | Adaptive metro refresh policy |
| 8 | Docs + tests |
