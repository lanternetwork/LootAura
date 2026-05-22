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

1. Confirm PR #484 + migration `200` + sprint prep (#486) deployed to production.
2. Deploy discovery phase fix (placeholder repair before graph enumeration) when merged.
3. Run one manual discovery cron (`POST /api/cron/discovery` with `CRON_SECRET`).
4. Verify last discovery: `stateBatchPlanned > 0`, `phasesCompleted` includes `placeholder_repair` and ideally `graph_enumeration`; registry candidates trending up.
5. If `statesScanned` stays 0 with `stateBatchPlanned > 0`: inspect orchestration notes (`graphEnumerationSkippedReason`) and [supabase/operations/ystm-one-week-sprint-verification.sql](../supabase/operations/ystm-one-week-sprint-verification.sql).
6. **Do not** clear post-deploy metrics window until discovery is healthy.

---

## Throughput (no new Vercel env vars)

Production is expected to run with **no `CRON_*` / `INGESTION_*` overrides in Vercel** (same as the 90% coverage program). The sprint uses **repo burn-in defaults** already wired in `*Config.ts` parsers and `vercel.json` cron schedules.

**Do not add Vercel env vars for this sprint.** If throughput is still insufficient after discovery is fixed, raise budgets via a **code default PR** (change `DEFAULT_*` constants), not platform env.

| Pipeline | Schedule (`vercel.json`) | Effective budget (unset env → repo default) |
|----------|--------------------------|-----------------------------------------------|
| Graph enumeration / discovery | 4×/day UTC 02/08/14/20 | 10 states, 1000 candidates, 500 validations, 120 placeholder repair (`discoveryCronConfig.ts`) |
| Coverage audit | 2×/day | 24 configs, 40 list fetches, 80 detail validations (`ystmCoverageAuditConfig.ts`) |
| Missing ingest | 2×/day | 48 attempts, 160 scanned (`ystmCoverageMissingIngestionConfig.ts`) |
| Catalog repair | 2×/day | 80 attempts, 200 scanned (`ystmCatalogRepairConfig.ts`) |
| Existing refresh | 2×/day | 32 attempts, 120 scanned (`ystmExistingUrlRefreshConfig.ts`) |
| Main ingestion | every 2 min | batch 60, budget 120s (`ingestionOrchestrationDefaults.ts`) |

**YSTM safety:** If graph panel block rate **>1%** for 24h, pause manual discovery triggers and investigate before any code-default increase.

**Optional later (not week-1):** Lead-approved PR to bump `DEFAULT_*` in config modules only if gates stall with discovery healthy.

---

## Days 2–7 (footprint + closure, same PR deploy)

No new Vercel env. Let 4×/day discovery + 2×/day repair/audit crons run on repo defaults.

| Day | Focus | Pass signal |
|-----|--------|-------------|
| **2** | Registry + placeholder | `candidatesDiscovered > 0`; last discovery includes `placeholder_repair` |
| **3** | Crawlable trend | `crawlableConfigs` up vs Day 0; `no source_pages` down |
| **4** | Audit V | `validActiveYstmUrls` rising (target ≥150 pending, ≥300 by Day 7) |
| **5** | Catalog repair drain | `catalogRepair` queue &lt; 200 and falling |
| **6** | Missing ingest | `missingValidYstmUrls` stable or down as V grows |
| **7** | Gate review | All three Week-1 greens or document blockers for code-default PR |

**Code in this sprint branch:**

- Discovery: `placeholder_repair` → **registry backlog promote** → `graph_enumeration` → promote new graph candidates → `revalidate`
- Registry backlog promote also runs when graph fails or is skipped
- Catalog repair cron repo defaults **80 attempts / 200 scanned** per run (still no Vercel env)

---

## Phase: closure (catalog repair + visibility)

| Pipeline | Sprint repo default | Gate target |
|----------|---------------------|-------------|
| Catalog repair (2×/day) | 80 repairs, 200 scanned | Queue **&lt; 100** |
| Missing ingest (2×/day) | 48 / 160 (unchanged) | Never-attempted not growing with V |
| Coverage audit (2×/day) | 24 / 40 / 80 (unchanged) | **V ≥ 300** by Day 7 |

Prioritize **catalog repair queue** in daily checks until under 100.

---

## Daily 15-minute check

1. Admin → Ingestion → **YSTM nationwide coverage** → **Week-1 sprint gates** (PASS/FAIL).
2. **Copy diagnostics** (includes coverage scoreboard when loaded).
3. Red flags: candidates still 0 after Day 2; crawlable flat 3 days; V stuck ~78 after Day 4.

---

## Deferred past week 1

- G4 fourteen-day hold, V ≥ 5000, sustained nationwide 90% claim
- New bulk backfill pipelines (unless registry still empty Day 3)
