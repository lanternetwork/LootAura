# YSTM one-week sprint (footprint + closure)

**Duration:** ≤7 calendar days  
**Product KPI (unchanged):** `coveragePct ≥ 90%` on large audit footprint — **not** achievable in one week; this sprint maximizes **footprint, registry fill, and repair drain** so the multi-week G4 program starts from a real baseline.

**Authoritative specs:** [YSTM_90_PERCENT_COVERAGE_SPEC.md](./YSTM_90_PERCENT_COVERAGE_SPEC.md), [YSTM_GRAPH_ENUMERATION_SPEC.md](./YSTM_GRAPH_ENUMERATION_SPEC.md)

---

## Week-1 exit criteria (three greens)

| Gate | Target | Scoreboard / diagnostics |
|------|--------|---------------------------|
| **Discovery works** | Last discovery: `statesScanned > 0`, `phasesCompleted` includes `graph_enumeration`, registry `candidatesDiscovered > 0` | YSTM coverage → graph enumeration panel |
| **Footprint** | `crawlableConfigs ≥ 200`, `configsWithoutSourcePages < 600` | Source expansion / acquisition |
| **Closure** | `catalogRepair` queue `< 100`, `validActiveYstmUrls ≥ 300` | Pipeline backlog + audit V |

**Do not** treat high `coveragePct` on small V (e.g. 91% on 78 URLs) as sprint success.

---

## Day 0–1 (blocking)

1. Confirm PR #484 + migration `200` live in production.
2. Run one manual discovery cron (`POST /api/cron/discovery` with `CRON_SECRET`).
3. If last discovery shows `0 states` and `phases none` for **>24h** after deploy: inspect `ingestion_orchestration_runs` (`mode=discovery_cron`) and `ingestion_discovery_state` (`key=source_discovery_nationwide`). See [supabase/operations/ystm-one-week-sprint-verification.sql](../supabase/operations/ystm-one-week-sprint-verification.sql).
4. **Do not** clear post-deploy metrics window until discovery is fixed.

---

## Vercel env (apply after Day 0 green; hold 48h if block rate >1%)

Set in production (values are sprint caps; repo defaults remain lower until unset):

```bash
# Discovery (4×/day — vercel.json)
CRON_DISCOVERY_MAX_STATES_PER_RUN=20
CRON_DISCOVERY_MAX_DISCOVERED_PAGES=3000
CRON_DISCOVERY_MAX_VALIDATION_FETCHES=1500
CRON_DISCOVERY_VALIDATION_FETCH_CONCURRENCY=8
CRON_DISCOVERY_MAX_PLACEHOLDER_REPAIR_CONFIGS=200

# Catalog repair (2×/day) — priority while queue ≥ 75
CRON_YSTM_CATALOG_REPAIR_MAX_ATTEMPTS=100
CRON_YSTM_CATALOG_REPAIR_MAX_SCANNED=200

# Coverage audit (2×/day) — enable when crawlable ≥ 150
CRON_YSTM_COVERAGE_MAX_CONFIGS=24
CRON_YSTM_COVERAGE_MAX_LIST_FETCHES=40
CRON_YSTM_COVERAGE_MAX_DETAIL_VALIDATIONS=80
CRON_YSTM_COVERAGE_MAX_URLS_PER_LIST_PAGE=120

# Missing ingest + refresh (burn-in max)
CRON_YSTM_MISSING_INGEST_MAX_ATTEMPTS=96
CRON_YSTM_MISSING_INGEST_MAX_SCANNED=320
CRON_YSTM_EXISTING_REFRESH_MAX_ATTEMPTS=48
CRON_YSTM_EXISTING_REFRESH_MAX_SCANNED=160

# Ingestion (when crawlable ≥ 200)
INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE=60
INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS=120000
```

Rollback: snapshot env before apply; revert all `CRON_*` / `INGESTION_*` overrides if YSTM block rate >1% for 24h.

---

## Daily 15-minute check

1. Admin → Ingestion → **YSTM nationwide coverage** → **Week-1 sprint gates** (PASS/FAIL).
2. **Copy diagnostics** (includes coverage scoreboard when loaded).
3. Red flags: candidates still 0 after Day 2; crawlable flat 3 days; V stuck ~78 after Day 4.

---

## Deferred past week 1

- G4 fourteen-day hold, V ≥ 5000, sustained nationwide 90% claim
- New bulk backfill pipelines (unless registry still empty Day 3)
