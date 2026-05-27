# YSTM Hands-Off Steady-State Program

**Objective:** Bring YSTM ingestion to self-stabilizing operation **before** ESNet expansion.

```
New listings arrive continuously.
Crons absorb, repair, publish, refresh, and reconcile them automatically.
Queues remain bounded.
Coverage remains ≥90%.
Duplicate visible sales remain at 0.
Operators monitor alerts, not tune the system daily.
```

**Related docs**

- Day-to-day cron budgets and scoreboard APIs: [`docs/OPERATIONS.md`](./OPERATIONS.md) — *external marketplace 90% product coverage*
- Long-form coverage spec (Phases 1–7 / G4): [`docs/EXTERNAL_SOURCE_COVERAGE_SPEC.md`](./EXTERNAL_SOURCE_COVERAGE_SPEC.md)
- Cross-provider convergence (Phases A–E): [`docs/OPERATIONS.md`](./OPERATIONS.md) — *Cross-provider sale convergence*
- Crawl-skip taxonomy and false-exclusion audit: [`docs/EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md`](./EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md)

**Code anchors**

| Concern | Location |
|---------|----------|
| Tier 1 / Tier 2 exit criteria | `lib/admin/ystmStabilizationExitCriteria.ts` |
| Overview health (`healthy` / `degraded` / `blocked`) | `lib/admin/ingestionDashboardOverview.ts`, `app/admin/ingestion/IngestionOverviewPanel.tsx` |
| Stabilization dashboard (exit table, clusters) | `app/admin/ingestion/IngestionStabilizationExitSection.tsx` |
| Duplicate cluster API | `GET /api/admin/ingestion/duplicate-canonical-clusters` |
| Same-platform publish guard | `lib/ingestion/identity/resolveCrossProviderPublishLink.ts` |
| Daily duplicate-cluster SLO cron | `GET/POST /api/cron/duplicate-canonical-slo` (`15 4 * * *` UTC) |

---

## Scope freeze (Phase 0)

Do not violate during this program:

```
ESNet ingest OFF · ESNet bootstrap OFF
No new providers · No parser rewrites · No dedupe weakening
No force-publish of gated rows
No widening audit/discovery while catalog repair > 100
Manual SQL = exception-only (cluster remediation, visibility fix, emergency)
Normal ops = crons + Controls + repair flows
```

---

## Tier model (exit gates)

Constants and evaluation: `evaluateYstmStabilizationExit()` in `lib/admin/ystmStabilizationExitCriteria.ts`.

### Tier 1 — Operationally stable (7 consecutive UTC days)

Required **before ESNet resumes:**

| Criterion | Target |
|-----------|--------|
| Coverage | ≥90% |
| Duplicate canonical publish clusters | 0 |
| Catalog repair queue | <100 |
| Missing valid URLs | ≤15 or documented residual |
| Detail-first proof | pass |
| Terminal `publish_failed` | low/stable (≤50) |
| Nationwide coverage bootstrap | **OFF** |

### Tier 2 — Program complete

| Criterion | Target |
|-----------|--------|
| Canonical key coverage | ≥95% |
| Suspicious crawl skips | <15% **or** formally documented benign |
| `existingRefreshStale` | flat/down 14 days |
| Phase 14 / cross-provider convergence | ready |

**Operator cadence:** daily ~5 min (Overview) during Phases 1–4; **weekly** after Tier 1 hold unless [intervention thresholds](#intervention-thresholds) fire.

The 7-day Tier 1 hold is tracked in an **ops daily log** (not enforced in code). The dashboard snapshot is point-in-time only.

---

## Workstreams (phases)

### Phase 0 — Scope freeze

- **Work:** Confirm ES.net off; no scope creep.
- **Exit:** Only YSTM stabilization work active.

### Phase 1 — Workstream A (P0): Duplicate canonical cluster prevention

#### 1A — SLO hold (ops + monitoring)

- **SLO:** `crossProviderConvergence.duplicatePublishedCanonicalClusters` on the YSTM scoreboard must stay **0**.
- **Automated check:** `/api/cron/duplicate-canonical-slo` daily at **04:15 UTC**; telemetry `ingestion.convergence.duplicate_canonical_publish_slo_check`.
- **Exit:** 0 duplicate canonical clusters for **7 consecutive UTC days** (ops log).

#### 1B — Same-platform publish guard (engineering)

- **Problem:** Publish-link reuse must cover **YSTM↔YSTM**, not only cross-provider siblings.
- **Implementation:** `resolveCrossProviderPublishLink` includes same-platform published siblings; publish worker reuses sibling before `createPublishedSale`.
- **Exit:** Integration/unit coverage + 7-day SLO hold with zero new clusters.

**Phase 1 complete when:** 1A + 1B exit.

### Phase 2 — Workstream B (P1): Canonical identity completion

- **Work:** Batched canonical backfill via ingestion **Controls**; after each batch, confirm Debug cluster panel = 0.
- **Parallel with Phase 3** once Phase 1B is deployed and clusters stay at 0.
- **Exit:** Canonical coverage ≥95%; clusters remain 0.
- **Note:** Backfill does not fix missing URLs; do not batch aggressively while convergence is unstable.

### Phase 3 — Workstream C (P1): Repair / enrichment equilibrium

| Metric | Exit |
|--------|------|
| `catalogRepairQueue` | <100 for **5 consecutive days** |
| Address enrichment backlog | flat/down 5 days |
| Missing valid URLs | **7-day negative slope** |

- **Work:** Let catalog-repair + missing-ingest crons run; weekly sample `repair_pending` / `detail_first_fallback`.
- **Escalation:** If repair **>200** for **5 days** → verify drain slope & success ratio → then increase **code-default** repair throughput (`ystmCatalogRepairConfig` / `coverageBudgetProfiles`) — **not** Vercel env vars.
- **Do not:** widen discovery/audit while repair >100.
- **Exit:** Repair <100 sustained; missing trending down.

### Phase 4 — Workstream D (P1): Coverage recovery

Bootstrap can grow **V** faster than repair reconciles → coverage % may **fall** while the pipeline is healthy.

| Condition | Bootstrap |
|-----------|-----------|
| repair ≥150 | ON (ignore coverage % target) |
| repair <100 and missing trending down | prepare **manual OFF** |
| bootstrap OFF | chase coverage ≥90% |

- **Rule:** Do not chase coverage % while bootstrap aggressively expands the denominator. Auto-disable exists but needs near-steady-state; expect **manual OFF** when repair <100 even if coverage <90%.
- **Daily ops log:** `date | V | visible | missing | coverage% | repair | bootstrap`
- **Exit:** coverage ≥90%, bootstrap OFF, missing ≤15 or documented, **7 consecutive UTC days**.

### Phase 5 — Workstream E (P2): Suspicious crawl skip classification

- **Context:** Elevated `url_match_dates_changed` and benign `url_match_refresh_queued` during bootstrap are common.
- **Work:** Sample 50× `url_match_dates_changed`; classify per [`EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md`](./EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md). Update runbook/dashboard copy.
- **Fix code only** if real false suppression is confirmed — **no global dedupe weakening**.
- **Exit:** Suspicious share <15% **or** formally documented benign (Tier 2).

### Phase 6 — Workstream F (P2): Refresh backlog control

- **After** repair stable. Track `existingRefreshStale`; correlate with refresh-queued skips.
- **Do not** spike refresh throughput before repair <100.
- **Exit:** flat/down 14 days; not driving missing growth.

### Phase 7 — Workstream G (P2): Needs-check policy

- Merge with repair family. Bucket oldest `needs_check` rows; define retry/expire/repair per bucket.
- **Exit:** `needs_check` bounded and explainable at steady-state.

### Phase 8 — Workstream H (P2): Dashboard finalization

Overview tab answers in ~30s:

| Health | Meaning |
|--------|---------|
| **healthy** | Tier 1 criteria pass; no blocked signals |
| **degraded** | Tier 1 not met but no immediate blockers |
| **blocked** | Duplicate clusters, detail-first fail, `publish_failed` >50, or repair ≥200 |

- **Effective bottleneck:** when geocode eligible ≤10, prefer catalog repair / address enrichment over raw `metrics.volume.bottleneck`.
- **Bootstrap advisories:** V up + coverage % down; bootstrap ON + coverage <90%.

Stabilization exit table and cluster drill-down remain on the stabilization section (#503).

### Phase 9 — Workstream I (P2): Automation / self-healing

- **Required:** daily duplicate-cluster SLO cron; Phase 1B guard; existing crons + bootstrap auto-disable.
- **Nice-to-have:** weekly digest, Slack, auto-remediation emails.
- **Exit:** No routine manual SQL for **30 consecutive days**.

---

## Intervention thresholds

Break weekly-only monitoring and act if any:

```
duplicate clusters > 0
repair rises 3 consecutive days
coverage < 85%
publish_failed spikes
refresh stale grows while bootstrap OFF
```

Otherwise: **do not retune.**

---

## ESNet resume (after Tier 1 + material Tier 2)

```
Tier 1 pass 7 days
Tier 2 materially complete
same-platform publish guard deployed
→ enable ESNet ingest only, bootstrap OFF, low-volume burn-in
→ watch duplicate clusters daily 14 days
→ do not scale ESNet until YSTM stable with ESNet on
```

See [`docs/ESTATESALES_NET_PROVIDER_ONBOARDING.md`](./ESTATESALES_NET_PROVIDER_ONBOARDING.md) for provider-specific steps.

---

## Ops-only checklist (no code)

- [ ] Phase 4 daily log running
- [ ] 7-day duplicate-cluster SLO hold (started when clusters hit 0)
- [ ] Batched canonical backfill via Controls (Phase 2)
- [ ] Bootstrap **manual OFF** when repair <100 and missing drains
- [ ] Tier 1 daily snapshot until 7-day hold completes

---

## Manual SQL (exception-only)

Duplicate cluster remediation pattern (ops, not routine):

1. Pick canonical winner/loser ingested rows for the cluster.
2. Set `superseded_by_ingested_sale_id` on loser; clear loser `published_sale_id`.
3. Set loser `sales.ends_at` in the past for visibility.
4. Re-run SLO query / scoreboard — clusters must return **0**.

---

## Deploy verification

After merge/deploy:

- [ ] Integration/unit: same-platform publish cannot create two `published_sale_id` per canonical key
- [ ] `GET /api/cron/duplicate-canonical-slo` (cron auth) matches scoreboard `duplicatePublishedCanonicalClusters`
- [ ] Overview health aligns with `evaluateYstmStabilizationExit` for current production snapshot
- [ ] After each canonical backfill batch, cluster API returns 0
- [ ] Bootstrap manual OFF → coverage % stabilizes or rises as missing drains

---

## Final success state

```
new listings continuously arrive
repair continuously drains
refresh continuously reconciles
coverage ≥90%
duplicate visible sales = 0
queues bounded
bootstrap OFF
operators monitor weekly
engineering intervenes only on real alerts
```
