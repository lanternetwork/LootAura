# YSTM 90% Coverage — Lead Analysis Specification

**Status:** Draft for lead review  
**Last updated:** 2026-05-21  
**Owner:** Ingestion / acquisition  
**Primary metric:** `YSTM_COVERAGE_TARGET_PCT` = **90%** (`lib/ingestion/ystmCoverage/ystmCoverageValidity.ts`)

---

## 1. Executive summary

LootAura’s YSTM HTML parsers and detail-first pipeline are **production-ready** (parser SLO ≥90%, detail-first ready rate ~100% in recent 24h rollups). The gap to the product goal — **90% of valid-active YSTM garage sales visible on LootAura** — is **not** a parsing problem. It is an **acquisition footprint and throughput** problem:

- Only a **small fraction** of YSTM city list pages are crawlable configs today (~62 crawlable vs ~922 discovery pending).
- Coverage-specific crons run **once per day** with **tight per-run budgets** (e.g. 12 missing-ingest attempts/day).
- General ingestion is **fetch-bound**; bulk list crawl mostly hits **duplicates** (expected once corpus overlaps YSTM).
- “Visible” requires **published** `sales` rows with **lat/lng** on the public read path, not merely `ingested_sales` rows.

This spec defines **phased operational and configuration work** (minimal code unless gaps are proven) to move the **coverage SLO** from current production levels to **≥90%**, using existing Phase 1–7 pipelines.

---

## 2. Problem statement

### 2.1 User-visible goal

> **90% of sales that are valid and active on YSTM are also visible on LootAura** (map/list/API), for the audited footprint.

### 2.2 Baseline (production signals, 2026-05-21)

| Signal | Approx. value | Interpretation |
|--------|---------------|----------------|
| Detail-first parser SLO | ~100% ready / attempted | Parsing path healthy |
| Phase G visible capture | ~0.2% fresh inserts / discovered | Misleading north star; corpus saturated |
| Discovery registry | ~922 pending, ~54 validated, ~62 crawlable | Geographic footprint incomplete |
| Ingestion bottleneck | **fetch** | Per-run budgets / domain pacing, not geocode/publish theory |
| Funnel fresh inserts | ~40 / 24h | Bulk crawl adds little net-new inventory |

### 2.3 YSTM HTML layers (confirmed compatible)

| Layer | Example URL | Ingestion use |
|-------|-------------|---------------|
| US index | `https://yardsaletreasuremap.com/US/` | **Not scraped**; static USPS catalog drives state list |
| State directory | `https://yardsaletreasuremap.com/US/Illinois/` | Discovery → city `.html` candidates |
| City list | `https://yardsaletreasuremap.com/US/Illinois/Chicago.html` | List crawl + `metadataStr` + `sale_url` discovery |
| Listing detail | `…/listing.html`, `…/userlisting.html` | Detail-first → ingest → geocode → publish |

**Trap URL:** `/US/{State}.html` (shell, no city links) — code must use **`/US/{State}/`** only (`sourceStateIndexCatalog.ts`).

### 2.4 Root cause (one sentence)

We do not **observe**, **ingest**, and **publish** enough distinct valid-active YSTM listing URLs per day relative to the URLs YSTM exposes nationwide, because **city config footprint and cron budgets are far below catalog scale**.

---

## 3. Metric definitions (authoritative)

### 3.1 Coverage SLO (the 90% target)

```text
coveragePct = publishedVisibleInAudit / validActiveYstmUrls × 100
```

- **`validActiveYstmUrls`:** Count of YSTM detail URLs classified as valid-active in `ystm_coverage_observations` (see `classifyYstmDetailAsValidActive`).
- **`publishedVisibleInAudit`:** Subset of those URLs present in `loadLootAuraPublishedYstmIndex` (published, active, Phase 4 public filters, **non-null lat/lng**, canonical YSTM detail URL).
- **Target:** `coveragePct ≥ 90` (`YSTM_COVERAGE_TARGET_PCT`).
- **Scoreboard:** `GET /api/admin/ingestion/ystm-coverage` → `buildYstmCoverageScoreboard`.

**Excluded from denominator (by design):** expired, gated-only, unparseable, removed listings, insufficient visible content (`YstmCoverageInvalidReason`).

### 3.2 Metrics that are NOT the 90% target

| Metric | Formula | Why it misleads |
|--------|---------|-----------------|
| Phase G visible capture | `freshInserted / crawlerDiscovered` | High duplicate skip when corpus ≈ YSTM |
| Detail-first parser SLO | `detailFirstReady / detailFirstAttempted` | Already ≥90%; measures parse quality only |
| Crawl discovered count | List URLs seen per run | Does not imply map-visible publish |

### 3.3 Operational health gates

Before treating coverage % as actionable:

- `validActiveYstmUrls ≥ 25` (`YSTM_COVERAGE_SLO_MIN_VALID_URLS`) — prefer **thousands** at steady state.
- Completed coverage audit within **48h** (`YSTM_COVERAGE_AUDIT_STALE_HOURS`).
- No critical `coverage_below_target` without a explained footprint expansion in progress.

Alerts: `lib/ingestion/ystmCoverage/ystmCoverageOperationalHealth.ts`.

---

## 4. System architecture (existing — no redesign required)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Source expansion (discovery cron, daily 04:00 UTC)              │
│   Static state catalog → fetch /US/{State}/ → validate city .html        │
│   → source_discovery / ingestion_city_configs (source_pages)             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Coverage audit (ystm-coverage-audit, daily 06:00 UTC)           │
│   Rotate crawlable configs → list fetch → URL extract → detail classify  │
│   → ystm_coverage_observations (valid active + lootaura_visible flags)   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────┐                   ┌───────────────────────────────┐
│ Phase 3: Missing ingest│                   │ Main ingestion (every 2 min)   │
│ (ystm-missing-ingest,  │                   │ mode=ingestion: list + detail  │
│  daily 08:00 UTC)      │                   │ first, dedupe, geocode, publish │
└───────────┬───────────┘                   └───────────────┬───────────────┘
            │                                               │
            └───────────────────────┬───────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 5: Catalog repair (ystm-catalog-repair, daily 12:00 UTC)           │
│   Unstick needs_geocode / publish_failed / needs_check → publish         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 4: Existing URL refresh (ystm-existing-refresh, daily 10:00 UTC)   │
│   Re-sync known ingested YSTM URLs (parity / anti-regression)            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
                    Published map-visible sales (coverage numerator)
```

**Supporting crons:** `geocode` (*/2 min), `daily` ingestion orchestration, `reconciliation` (hourly).

**Key code paths:**

| Concern | Path |
|---------|------|
| List + metadata parse | `lib/ingestion/adapters/externalPageSource.ts` |
| State index discovery | `lib/ingestion/discovery/sourceDiscovery.ts`, `sourceStateIndexCatalog.ts` |
| Discovery budgets | `lib/ingestion/discovery/discoveryCronConfig.ts` |
| Coverage validity | `lib/ingestion/ystmCoverage/ystmCoverageValidity.ts` |
| Coverage audit | `lib/ingestion/ystmCoverage/runYstmCoverageAuditCron.ts` |
| Missing ingest | `lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron.ts` |
| Published index | `lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex.ts` |
| Admin scoreboard UI | `app/admin/ingestion/YstmCoverageScoreboardSection.tsx` |
| Cron schedule | `vercel.json` |

---

## 5. Scope

### 5.1 In scope

- Environment and schedule tuning for existing crons.
- Operational runbooks, monitoring, and phase gates.
- Targeted code fixes **only** where telemetry proves a blocker (e.g. systematic `publish_failed`, wrong `source_pages` URL shape).
- Footprint expansion until crawlable configs approximate YSTM city catalog scale.

### 5.2 Out of scope

- Scraping `/US/` for dynamic state discovery (catalog already equivalent).
- Rewriting list/detail parsers for nation/state/city HTML already validated in fixtures/tests.
- New crawling behavior (browser automation, non-configured URLs) — violates v1 architecture locked decisions unless explicitly approved.
- Merging PRs to main, changing retry/status models, or parallel publish paths.
- Treating Phase G fresh-insert rate as primary KPI.

---

## 6. Phased delivery plan

Phases are **sequential for governance** but **overlap in execution** where different crons/workstreams are independent.

---

### Phase 0 — Baseline & instrumentation lock

**Goal:** Establish a single source of truth for lead analysis and prevent metric confusion.

**Duration:** 1–2 days  

**Work items**

| ID | Task | Owner |
|----|------|-------|
| 0.1 | Export admin YSTM Coverage scoreboard JSON (`/api/admin/ingestion/ystm-coverage`) and archive snapshot | Ops / eng |
| 0.2 | Record ingestion diagnostics rollup (Phase G, funnel, acquisition registry, fetch bottleneck) | Ops / eng |
| 0.3 | Document current env overrides vs defaults (discovery, coverage, missing-ingest, orchestration) | Ops |
| 0.4 | Confirm detail-first proof status = **pass** (`detailFirstProofProtocol`) | Eng |
| 0.5 | Agree program KPI: **only** `coveragePct` vs `YSTM_COVERAGE_TARGET_PCT` | Lead |

**Exit criteria**

- [ ] Scoreboard snapshot stored with timestamp.
- [ ] Written acknowledgment: parser SLO green ≠ coverage SLO green.
- [ ] List of top 5 states/metros by `missingByState` / `missingByMetro` from scoreboard.

**Deliverable:** Baseline report appendix (numbers filled from 0.1–0.3).

---

### Phase 1 — Coverage audit footprint (observe the gap)

**Goal:** Grow `ystm_coverage_observations` so `validActiveYstmUrls` reflects a large, rotating sample of YSTM inventory.

**Cron:** `GET/POST /api/cron/ystm-coverage-audit` — default **06:00 UTC daily** (`vercel.json`).

**Default budgets (production):**

| Env var | Default | Cap |
|---------|---------|-----|
| `CRON_YSTM_COVERAGE_MAX_CONFIGS` | 8 | 40 |
| `CRON_YSTM_COVERAGE_MAX_LIST_FETCHES` | 12 | 80 |
| `CRON_YSTM_COVERAGE_MAX_DETAIL_VALIDATIONS` | 24 | 120 |
| `CRON_YSTM_COVERAGE_MAX_URLS_PER_LIST_PAGE` | 80 | 200 |

**Work items**

| ID | Task |
|----|------|
| 1.1 | Raise audit budgets in staging; validate no lease overlap / timeout (`CRON_YSTM_COVERAGE_MAX_RUNTIME_MS`, max 300_000 ms). |
| 1.2 | Promote staging values to production in steps (e.g. 2×, then 4×). |
| 1.3 | Monitor `list_pages_fetched`, `listing_urls_discovered`, `detail_pages_validated` on `ystm_coverage_audit_runs`. |
| 1.4 | Ensure `observationFootprintUrls` and `validActiveYstmUrls` trend up week-over-week. |
| 1.5 | Optional: second daily audit window (additional `vercel.json` cron entry) if single run insufficient — requires deploy approval. |
| 1.6 | **Code:** `metadataStr` list URL extraction; audit cron walks all `source_pages` (not only `pages[0]`). |

**Exit criteria**

- [ ] `validActiveYstmUrls ≥ 1_000` (interim); path to **≥ 5_000** documented.
- [ ] No `coverage_audit_stale` alert for 7 consecutive days.
- [ ] `missingValidYstmUrls` queue is populated and stable (not zero because audit never ran).

**Risks:** YSTM rate limiting on list/detail fetch; increase `EXTERNAL_FETCH` pacing before raising concurrency.

**Dependencies:** Phase 2 must add crawlable configs; audit only rotates **crawlable** configs.

---

### Phase 2 — Source expansion (widen geographic footprint)

**Goal:** Move discovery registry from ~62 crawlable configs toward **national city catalog coverage** (thousands of city list pages).

**Cron:** `GET/POST /api/cron/discovery` — default **04:00 UTC daily** (`vercel.json`).

**Default budgets:**

| Env var | Default | Cap |
|---------|---------|-----|
| `CRON_DISCOVERY_MAX_STATES_PER_RUN` | 3 | 15 |
| `CRON_DISCOVERY_MAX_DISCOVERED_PAGES` | 80 | 500 |
| `CRON_DISCOVERY_MAX_VALIDATION_FETCHES` | 40 | 200 |
| `CRON_DISCOVERY_MAX_REVALIDATION_CONFIGS` | 40 | 200 |
| `CRON_DISCOVERY_MAX_PLACEHOLDER_REPAIR_CONFIGS` | 60 | 200 |

**Work items**

| ID | Task |
|----|------|
| 2.1 | Raise validation and discovered-page caps; monitor `pendingDiscoveryConfigs` ↓. |
| 2.2 | Run placeholder repair pass (`maxPlaceholderRepairConfigsPerRun`) until `configsWithoutSourcePages` < 100 alert threshold. |
| 2.3 | Verify promoted configs use **`/US/{State}/{City}.html`** URLs, not `.html` state shells. |
| 2.4 | Track `crawlableConfigs`, `validatedDiscoveryConfigs`, `failedDiscoveryConfigs` on scoreboard. |
| 2.5 | Prioritize high-YSTM-volume states/metros from Phase 0 `missingByState` if backlog is huge. |
| 2.6 | Optional code: bulk import validated discovery rows — **only if** env tuning cannot drain 922 pending in acceptable calendar time. |
| 2.7 | **Code:** Reject `{State}.html` state shells on promote/validate; nationwide placeholder repair each run; priority state catalog (IL, TX, CA, …); second daily discovery cron (16:00 UTC); revalidation burn-in 120/run. |

**Exit criteria**

- [ ] `crawlableConfigs ≥ 500` (interim); target **≥ 2_000** for nationwide representativeness (lead to set final number from YSTM catalog count).
- [ ] `pendingDiscoveryConfigs` < 100 or draining >100/week.
- [ ] `configsWithoutSourcePages` < 100.
- [ ] No increase in `failedDiscoveryConfigs` without triage.

**Capacity note:** At 40 validations/day, 922 pending ≈ 23 days minimum — scaling validations is mandatory for Phase 2 timeline under 4 weeks.

**Dependencies:** None for starting; Phase 1 and 3 depend on crawlable growth.

---

### Phase 3 — Missing URL ingestion (close the coverage gap)

**Goal:** Convert audit-identified **valid-active, not visible** URLs into published map-visible sales.

**Cron:** `GET/POST /api/cron/ystm-missing-ingest` — default **08:00 UTC daily** (`vercel.json`).

**Default budgets:**

| Env var | Default | Cap |
|---------|---------|-----|
| `CRON_YSTM_MISSING_INGEST_MAX_ATTEMPTS` | 12 | 60 |
| `CRON_YSTM_MISSING_INGEST_MAX_SCANNED` | 48 | 200 |

**Work items**

| ID | Task |
|----|------|
| 3.1 | Raise missing-ingest budgets in proportion to `missingIngestionQueue` size. |
| 3.2 | Drive `missingIngestionNeverAttempted` → 0. |
| 3.3 | Track `missingIngestionPublished`, `missingIngestionFailed` daily. |
| 3.4 | Optional second daily cron slot for missing-ingest while `coveragePct < 90`. |
| 3.5 | Sample failures: fetch_failed, address_validation_failed, publish_failed — fix only systemic issues. |

**Exit criteria**

- [ ] `missingIngestionNeverAttempted = 0`.
- [ ] Sustained `missingIngestionPublished` ≥ program target (see §7 throughput model).
- [ ] `missingValidYstmUrls / validActiveYstmUrls ≤ 0.10` (10% gap = 90% coverage).

**Dependencies:** Phase 1 observations; Phase 2 footprint for new missing URLs entering queue.

---

### Phase 4 — Existing URL refresh (hold parity)

**Goal:** Prevent coverage **regression** on already-ingested YSTM URLs; keep dates/content/publish state current.

**Cron:** `GET/POST /api/cron/ystm-existing-refresh` — default **10:00 UTC daily**.

**Work items**

| ID | Task |
|----|------|
| 4.1 | Monitor `existingRefreshStale` (< 150 alert threshold at scale). |
| 4.2 | Tune `CRON_YSTM_EXISTING_REFRESH_MAX_ATTEMPTS` / `MAX_SCANNED` if stale backlog grows during Phases 2–3. |

**Exit criteria**

- [ ] `coverage_trend_declining` alert not firing for 14 days while Phases 2–3 active.
- [ ] `existingRefreshStale` below warning threshold at 90% coverage.

**Dependencies:** Runs in parallel; not sufficient alone to reach 90%.

---

### Phase 5 — Catalog repair (ingested but not visible)

**Goal:** Drain rows stuck in `needs_geocode`, `publish_failed`, `needs_check` so ingested inventory becomes **published + coordinates**.

**Cron:** `GET/POST /api/cron/ystm-catalog-repair` — default **12:00 UTC daily**.

**Default budgets:** `CRON_YSTM_CATALOG_REPAIR_MAX_ATTEMPTS` default 20, cap 100.

**Work items**

| ID | Task |
|----|------|
| 5.1 | Report `catalogRepairQueue`, `publishFailed`, `needsGeocode`, `needsCheck` from scoreboard. |
| 5.2 | Raise repair budgets while `catalogRepairQueue ≥ 75`. |
| 5.3 | Triage top `publish_failed` / `failure_details` codes (sample from same-run publish failures in diagnostics). |
| 5.4 | Code fix only for repeatable publish/geocode blockers. |

**Exit criteria**

- [ ] `catalogRepairQueue < 75` sustained.
- [ ] `repairedPublishedLast24h` > 0 until queue near zero.
- [ ] `readyUnpublished` not growing unbounded.

**Dependencies:** Geocode cron throughput (`GEOCODE_CRON_QUEUE_BATCH`, `GEOCODE_CONCURRENCY`).

---

### Phase 6 — Main ingestion fetch throughput

**Goal:** Relieve **fetch** bottleneck for list re-crawl on crawlable configs; support net-new discovery on saturated cities and Phase 6 detail-first refresh on list re-crawl.

**Cron:** `GET/POST /api/cron/daily?mode=ingestion` — **every 2 minutes** (`vercel.json`).

**Default orchestration:**

| Setting | Default | Cap |
|---------|---------|-----|
| `INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE` | 20 | 500 |
| `INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS` | 45_000 | 240_000 |
| `EXTERNAL_FETCH_DOMAIN_MIN_SPACING_MS` | 500 | 60_000 |
| `INGESTION_ORCHESTRATION_MIN_MINUTES` (throttle) | 10 (adaptive) | — |
| Adaptive max batch / budget | 40 configs / 120s | per `adaptiveThroughputConfig.ts` |

**Work items**

| ID | Task |
|----|------|
| 6.1 | Confirm adaptive profile not stuck in conservative/recovery (`INGESTION_ADAPTIVE_ENABLED`). |
| 6.2 | Increase config batch and execution budget in stepwise production changes. |
| 6.3 | Monitor fetch rollup: `budgetExitCount`, domain totals, configs processed per day. |
| 6.4 | Accept high `duplicateExistingUrl` on mature cities — do not optimize away dedupe. |

**Exit criteria**

- [ ] Diagnostics no longer report **fetch** as primary bottleneck OR fetch exits are budget-driven with planned caps documented.
- [ ] `configsWithRecentInsert` increases in high-YSTM metros as footprint expands.

**Dependencies:** Phase 2 crawlable configs.

---

### Phase 7 — Coverage SLO attainment & steady state

**Goal:** **`coveragePct ≥ 90`** on admin scoreboard with healthy operational alerts.

**Work items**

| ID | Task |
|----|------|
| 7.1 | Weekly lead review: coverage %, trend, backlog sections on scoreboard. |
| 7.2 | When `coveragePct ≥ 90`, ratchet discovery/audit/missing budgets down to steady-state cost. |
| 7.3 | Define steady-state cron budgets (document in OPERATIONS.md cross-link). |
| 7.4 | Parser regression Tier 0 remains green; detail-first proof remains pass. |

**Exit criteria (program complete)**

- [ ] `coveragePct ≥ 90` for **14 consecutive days**.
- [ ] `validActiveYstmUrls ≥ YSTM_COVERAGE_SLO_MIN_VALID_URLS` with lead-agreed minimum footprint (recommend **≥ 5_000**).
- [ ] All critical `evaluateYstmCoverageOperationalHealth` alerts cleared.
- [ ] `missingValidYstmUrls / validActiveYstmUrls ≤ 0.10`.
- [ ] No `coverage_trend_declining` (>5 pp drop between audits).

---

## 7. Throughput model (for lead planning)

Let:

- `V` = `validActiveYstmUrls` (denominator)
- `M` = `missingValidYstmUrls` (must become visible)
- Target coverage `T` = 0.90

Required visible in audit footprint: `ceil(V × T)`. Gap to close: `M ≈ V - publishedVisibleInAudit` (when footprint stable).

**Daily publish requirement (approximate):**

```text
requiredNetVisiblePerDay ≈ M / daysToTarget
```

Example: `V = 10_000`, current coverage 50% → `M ≈ 4_000`. To reach 90% in **30 days** → **~133** successful net-visible publishes/day.

**Current missing-ingest capacity (default):** 12 attempts/day → insufficient unless multiple pipelines contribute.

**Contributors to net-visible publishes:**

1. Phase 3 missing-ingest (`missingIngestionPublished`)
2. Phase 5 catalog repair (`repairedPublishedLast24h`)
3. Phase 6 main ingestion (`freshInserted` + publish path)
4. Phase 3B detail-first on list crawl (mostly duplicates today; rises with new cities)

Lead should set `daysToTarget` and approve budget scales using the formula above.

---

## 8. Environment variable checklist (rollout)

Apply in **staging first**, then production stepwise. Record actual values in Phase 0 appendix.

### 8.1 Discovery (Phase 2)

```bash
CRON_DISCOVERY_MAX_STATES_PER_RUN=10
CRON_DISCOVERY_MAX_DISCOVERED_PAGES=200
CRON_DISCOVERY_MAX_VALIDATION_FETCHES=120
CRON_DISCOVERY_MAX_PLACEHOLDER_REPAIR_CONFIGS=120
CRON_DISCOVERY_MAX_REVALIDATION_CONFIGS=120
```

### 8.2 Coverage audit (Phase 1)

```bash
CRON_YSTM_COVERAGE_MAX_CONFIGS=24
CRON_YSTM_COVERAGE_MAX_LIST_FETCHES=40
CRON_YSTM_COVERAGE_MAX_DETAIL_VALIDATIONS=80
CRON_YSTM_COVERAGE_MAX_URLS_PER_LIST_PAGE=120
```

### 8.3 Missing ingest (Phase 3)

```bash
CRON_YSTM_MISSING_INGEST_MAX_ATTEMPTS=48
CRON_YSTM_MISSING_INGEST_MAX_SCANNED=160
```

### 8.4 Catalog repair (Phase 5)

```bash
CRON_YSTM_CATALOG_REPAIR_MAX_ATTEMPTS=60
CRON_YSTM_CATALOG_REPAIR_MAX_SCANNED=160
```

### 8.5 Main ingestion (Phase 6)

```bash
INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE=60
INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS=120000
INGESTION_ADAPTIVE_MAX_CONFIG_BATCH=60
INGESTION_ADAPTIVE_MAX_EXECUTION_BUDGET_MS=120000
GEOCODE_CRON_QUEUE_BATCH=40
GEOCODE_CONCURRENCY=4
INGEST_BATCH_SIZE=200
```

**Note:** Values above are **starting recommendations** for backlog burn-down, not final steady-state. Respect caps in respective `*Config.ts` parsers.

---

## 9. Cron schedule reference

| UTC schedule | Path | Phase |
|--------------|------|-------|
| `*/2 * * * *` | `/api/cron/daily?mode=ingestion` | 6 |
| `*/2 * * * *` | `/api/cron/geocode` | 5/6 |
| `0 4 * * *` | `/api/cron/discovery` | 2 |
| `0 6 * * *` | `/api/cron/ystm-coverage-audit` | 1 |
| `0 8 * * *` | `/api/cron/ystm-missing-ingest` | 3 |
| `0 10 * * *` | `/api/cron/ystm-existing-refresh` | 4 |
| `0 12 * * *` | `/api/cron/ystm-catalog-repair` | 5 |

Source: `vercel.json`.

---

## 10. Governance & review gates

| Gate | When | Approver | Evidence |
|------|------|----------|----------|
| G0 | Phase 0 complete | Lead | Baseline scoreboard + diagnostics snapshot |
| G1 | Phase 2 staging budget trial | Lead | 7-day discovery telemetry, no YSTM block |
| G2 | Production budget increase | Lead | G1 + rollback plan |
| G3 | Interim coverage ≥ 70% | Lead | 2 consecutive audit runs |
| G4 | Program complete ≥ 90% | Lead | Phase 7 exit criteria |

**Rollback:** Revert env vars to Phase 0 snapshot; crons are stateless aside from DB cursors (`ingestion_orchestration_state`).

---

## 11. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| YSTM HTTP throttling / blocking | Phases 1–3 stall | Respect domain spacing; step budget increases; monitor fetch errors |
| Denominator grows faster than numerator | Coverage % flat or drops | Phase 2 before aggressive Phase 1 scaling; track ratio not just % |
| `publish_failed` systemic issue | Missing ingest succeeds but not visible | Phase 5 triage + targeted code fix |
| False confidence from small `V` | Premature “90%” | Enforce `validActiveYstmUrls` minimum in Phase 7 |
| Metric confusion | Wrong prioritization | Phase 0 KPI lock; parser SLO out of program scope |
| Vercel cron runtime limits | Budget exits | `MAX_RUNTIME_MS` tuning; optional second cron slot |

---

## 12. Code change triggers (exception list)

Code changes are **out of default scope**. Open a ticket only if telemetry shows:

| Symptom | Likely area |
|---------|-------------|
| Sustained `unparseable_detail` on audit | `parseYstmDetailPageFromHtml` |
| Validation rejects real city pages | `sourceDiscoveryValidator.ts` |
| Wrong URL promoted (`Illinois.html` vs `Illinois/`) | discovery promotion / catalog repair |
| `publish_failed` cluster with single DB/code | publish worker / geocode gates |
| `gated_only` spike | address resolver / YSTM DOM change |

---

## 13. Suggested timeline (indicative)

| Calendar week | Phases active | Lead checkpoint |
|---------------|---------------|-----------------|
| 1 | 0, 2 (start) | G0, crawlable count |
| 2 | 2, 1 | G1 staging |
| 3 | 2, 1, 3, 6 | G2 production budgets |
| 4 | 3, 5, 6 | `coveragePct` trajectory |
| 5–8 | 3–7 | G3 interim 70% |
| 9+ | 7 steady state | G4 complete |

Adjust weeks using §7 throughput model and approved daily publish target.

---

## 14. Appendix A — Phase 0 baseline (2026-05-21)

**API pull:** `GET https://lootaura.com/api/admin/ingestion/ystm-coverage` → **401 Unauthorized** from this environment (admin session cookie required). Route exists on production (401, not 404).

**Scoreboard denominator (production SQL, `lootaura_v2.ystm_coverage_observations`):**

```json
[
  {
    "observation_footprint": 0,
    "valid_active_v": 0,
    "published_visible_p": 0,
    "missing_valid_m": 0,
    "coverage_pct": null
  }
]
```

**Interpretation:** Coverage SLO is **not yet measurable** (`coverage_denominator_sparse` / `coverage_no_audit_denominator`). `missing_valid_m = 0` means **no audit footprint**, not “nothing missing on YSTM.” Phase 1 audit + Phase 2 footprint must run before 3/7/14-day publish math uses §7.

**Other confirmed sources:** Production Ingestion Diagnostics `2026-05-21T11:03:55.233Z`; acquisition registry in same rollup; PR #478 planning snapshot for nationwide published corpus (~299).

| Field | Value | Source / date |
|-------|-------|----------------|
| `coveragePct` | **null** | Production SQL |
| `validActiveYstmUrls` (V) | **0** | Production SQL |
| `publishedVisibleInAuditFootprint` (P) | **0** | Production SQL |
| `missingValidYstmUrls` (M) | **0** | Production SQL (not actionable) |
| `observationFootprintUrls` | **0** | Production SQL |
| `publishedActiveLootAuraYstmUrls` (corpus) | **262** | Scoreboard `2026-05-21T14:09:12Z` (G0.1 JSON) |
| `crawlableConfigs` | **62** | Diagnostics acquisition |
| `pendingDiscoveryConfigs` | **922** | Diagnostics acquisition |
| `validatedDiscoveryConfigs` | **54** | Diagnostics acquisition |
| `missingIngestionQueue` | **PENDING EXPORT** | Scoreboard API |
| `missingIngestionNeverAttempted` | **PENDING EXPORT** | Scoreboard API |
| `catalogRepairQueue` | **PENDING EXPORT** | Scoreboard API |
| `publishFailed` (repair) | **PENDING EXPORT** | Scoreboard API |
| Detail-first proof status | **pass** | Diagnostics Phase 3B |
| Detail-first success rate | **100.0%** (19,138/19,138) | Diagnostics Phase 3B |
| Phase G visible capture rate | **0.2%** (40/24,942) | Diagnostics Phase G |
| Phase G parser − visible gap | **99.8%** | Diagnostics Phase G |
| Primary bottleneck (diagnostics) | **fetch** | Diagnostics |
| `needs_check` (ingested) | **277** | Diagnostics queues |
| Funnel published (24h) | **37** | Diagnostics funnel |
| Funnel fresh inserted (24h) | **40** | Diagnostics funnel |
| Default missing-ingest capacity | **12 attempts/day** | `ystmCoverageMissingIngestionConfig` |

---

## 15. Appendix B — Related documents

- `docs/INGESTION_FINAL_ALIGNED_SPEC.md` — lifecycle / publish DoD
- `docs/ingestion-v1-architecture.md` — adapter-only configured pages
- `docs/OPERATIONS.md` — discovery Phase 4, reconciliation, public visibility Phase 4
- Admin UI: Ingestion dashboard → YSTM Coverage scoreboard

---

## 16. Phase 0 completion checklist (G0 — fill before Phase 1 deploy)

| Step | Action | Done |
|------|--------|------|
| G0.1 | Export `GET /api/admin/ingestion/ystm-coverage` while logged in as admin; save JSON with timestamp | [x] (`docs/baselines/ystm-coverage-scoreboard-2026-05-21T1409Z.json`) |
| G0.2 | Archive production ingestion diagnostics rollup (Phase G, funnel, acquisition) | [x] (2026-05-21 in Appendix A) |
| G0.3 | Document production env overrides vs repo defaults (Vercel → table below) | [x] (all unset — repo burn-in defaults apply; not used in Vercel) |
| G0.4 | Confirm detail-first proof **pass** on production | [x] |
| G0.5 | Lead sign-off: program KPI = **`coveragePct` ≥ 90** only (not parser SLO / Phase G fresh insert) | [x] (2026-05-21) |
| G0.6 | Re-run SQL on `ystm_coverage_observations` after first audit (post–Phase 1 deploy) | [ ] |

**Production env overrides:** None configured in Vercel and not planned — **repo burn-in defaults** from PR #479 apply in production after deploy.

| Variable | Production (Vercel) | Repo default (burn-in) |
|----------|---------------------|-------------------------|
| `CRON_YSTM_COVERAGE_MAX_CONFIGS` | unset | 24 |
| `CRON_YSTM_COVERAGE_MAX_LIST_FETCHES` | unset | 40 |
| `CRON_YSTM_COVERAGE_MAX_DETAIL_VALIDATIONS` | unset | 80 |
| `CRON_YSTM_MISSING_INGEST_MAX_ATTEMPTS` | unset | 48 |
| `CRON_DISCOVERY_MAX_VALIDATION_FETCHES` | unset | 120 |
| `CRON_DISCOVERY_MAX_STATES_PER_RUN` | unset | 10 |

## 17. Decision log (lead fill-in)

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-21 | Phase 0 G0 complete; KPI = `coveragePct` ≥ 90 only | Lead agent approved; proceed Phase 1 |
| | Target `daysToTarget` | |
| | Minimum `validActiveYstmUrls` at G4 | |
| | Approved env budget tier (staging/prod) | |
| | Second daily cron for missing-ingest? Y/N (repo default: **Y** — 06+18 / 08+20 UTC) | |
| | Code exception tickets opened | |
| | Phase 0 G0 complete | |

---

*End of specification.*
