# external marketplace Nationwide Graph Enumeration

**Status:** Implemented on PR #484 (Phases 0–7)  
**Program KPI:** `coveragePct >= 90%` — see `docs/EXTERNAL_SOURCE_COVERAGE_SPEC.md`

## Objective

Accelerate nationwide **city/list page** registry fill. Graph enumeration feeds existing ingestion, coverage audit, missing-ingest, repair, and refresh. It does **not** publish sales or replace detail-first ingestion.

## Architecture

- **Single pipeline:** `/api/cron/discovery` evolved to graph enumeration mode (no parallel full-scale legacy discovery).
- **Reuse:** `sourceDiscovery.ts` extraction, `sourceDiscoveryValidator.ts`, `promoteSourceDiscoveryResults.ts`, placeholder repair + revalidation in `runSourceDiscoveryCron.ts`.
- **Registry:** `lootaura_v2.ystm_source_page_candidates` (migration `200`).

## Cron schedule (UTC)

| Time | Path |
|------|------|
| 02:00, 08:00, 14:00, 20:00 | `/api/cron/discovery` |

## Default budgets (repo burn-in)

| Variable | Default | Cap |
|----------|---------|-----|
| `CRON_DISCOVERY_MAX_STATES_PER_RUN` | 10 | 25 |
| `CRON_DISCOVERY_MAX_DISCOVERED_PAGES` | 1000 | 5000 |
| `CRON_DISCOVERY_MAX_VALIDATION_FETCHES` | 500 | 2000 |
| `CRON_DISCOVERY_VALIDATION_FETCH_CONCURRENCY` | 4 | 8 |

Aliases: `YSTM_GRAPH_ENUMERATION_*` env vars (same parsers).

## Admin visibility (Phase 7)

external marketplace Coverage scoreboard → **external marketplace graph enumeration** panel (`graphEnumeration` on `/api/admin/ingestion/ystm-coverage`).

| Field | Source |
|-------|--------|
| Catalog states / states w/ candidates / states remaining | Candidate registry + nationwide catalog |
| Candidates total / pending / validated | `ystm_source_page_candidates` |
| Invalid by status | `invalidPagesByStatus` (rendered in panel) |
| Registry promoted | Rows with `promoted_at` |
| Configs promoted (last run) | Latest `ingestion_orchestration_runs` (`mode=discovery_cron`) |
| Crawlable / no source pages | `sourceExpansion` metrics |
| Validations (24h), fetch/block rates, throttle | Registry activity last 24h |
| Last discovery run | Status, duration, states scanned, phases, throttle from orchestration notes |

Promotion writes `promoted_config_id` on candidate rows when configs are inserted/updated.

## Rollout

1. Apply migration `200_ystm_graph_enumeration_candidate_registry.sql`.
2. Merge PR #484 and deploy; discovery cron runs 4×/day with persisted candidates.
3. Watch `crawlableConfigs`, `configsWithoutSourcePages`, candidate registry counts.
4. Expect coverage % may dip temporarily as audit footprint widens (not regression).

## Non-goals

No bypass of publish lifecycle, dedupe, detail-first, or coverage audit. No browser automation. No detail-page fetch during enumeration.

## Out of scope for this PR

- Program exit **G4** (`coveragePct >= 90%` sustained) — operational burn-in after deploy.
- Staged Phase 8 Step A-only deploy (throughput + schedule shipped with registry in one PR).
