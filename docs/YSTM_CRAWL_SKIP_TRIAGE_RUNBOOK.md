# YSTM crawl-skip triage runbook (Workstream E / Phase 5)

**Purpose:** Classify elevated **suspicious** crawl-skip share during YSTM stabilization without weakening dedupe or force-publishing gated rows.

**Related:** [`EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md`](./EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md) (taxonomy definitions), [`YSTM_HANDS_OFF_STEADY_STATE_PROGRAM.md`](./YSTM_HANDS_OFF_STEADY_STATE_PROGRAM.md) (Tier 2 exit), ingestion dashboard **Debug → Crawl skip taxonomy**.

---

## What the metric means

- **Classified skips** = external list-crawl paths that recorded a crawl-skip sub-reason (observability only; suppression behavior unchanged).
- **Suspicious share** = `suspicious / classified` over 24h — **not** total duplicate rate or publish failure rate.
- **Alert threshold:** suspicious share ≥ **15%** when classified skips **n ≥ 20** (`CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING`).

Code: `lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth.ts`, rollup from `lib/admin/crawlSkipTaxonomyMetrics.ts`.

---

## Expected during nationwide bootstrap

When coverage bootstrap is **ON**, V grows faster than repair reconciles. It is common to see:

| Sub-reason | Typical interpretation |
|------------|------------------------|
| `url_match_dates_changed` | Same URL, schedule moved — often **benign** during bootstrap (refresh path queued) |
| `url_match_refresh_queued` | **Benign** — system already scheduled detail refresh |
| `url_match_same_dates` / `url_match_same_payload` | **Benign** — no action |
| `soft_dedupe_exact_address_date` | **Benign** — expected dedupe |

**Do not** treat elevated suspicious share alone as a parser or dedupe regression while bootstrap is ON and repair queue is high. Track the **top sub-reason mix** and daily ops log (`V`, coverage %, repair, bootstrap).

---

## When to run this runbook

Act when **any** of:

1. Overview or Debug shows suspicious share ≥ 15% (n ≥ 20) **and** bootstrap is OFF or repair < 100.
2. Tier 2 crawl-skip criterion is failing on the stabilization exit table.
3. `url_match_dates_changed` or `url_match_location_changed` rises week-over-week while missing URLs are flat/up.

**Defer triage** if bootstrap is ON, repair ≥ 150, and top reasons are `url_match_refresh_queued` + `url_match_dates_changed` only — document as bootstrap-expected in the ops log.

---

## Triage procedure (≈30 min)

### 1. Snapshot (Debug)

1. Open **Ingestion → Debug → Crawl skip taxonomy (24h)**.
2. Record: classified total, benign / suspicious / operational counts, suspicious share, top 5 sub-reasons.
3. Note **Coverage bootstrap** state on Controls (ON/OFF).

### 2. Sample `url_match_dates_changed` (n = 50)

Pull recent rows from orchestration notes or false-exclusion traces where sub-reason is `url_match_dates_changed` (admin diagnostics export includes crawl-skip rollup; for row-level traces use false-exclusion / sale-identity dashboard samples).

For each sample, classify:

| Outcome | Meaning | Action |
|---------|---------|--------|
| **A — Benign refresh** | Same real-world event; dates within ±3d tolerance or refresh already queued | Document; no code change |
| **B — URL reuse / new event** | Material date/location change; old pin should end | Confirm Phase 5 URL-reuse path ran (`new_event_same_url` / supersession) — file bug if not |
| **C — False suppression** | Valid new listing wrongly skipped | Narrow fix only (specific classifier/gate); **no global dedupe weakening** |
| **D — Operational** | `repair_pending`, `publish_failed`, gated row | Route to repair / publish workstreams |

### 3. Decision

| Sample result | Program action |
|---------------|----------------|
| ≥ 80% A | Mark Workstream E **documented benign**; Tier 2 satisfied with written note in ops log |
| Mix of B | Verify existing-url refresh cron draining `existingRefreshStale`; do not widen audit |
| Any C confirmed | Engineering ticket: targeted fix + regression test on that sub-reason only |
| Mostly D | Workstream C/D (repair / missing ingest), not crawl-skip taxonomy |

### 4. Document (required for Tier 2 “formally documented benign”)

Add to weekly ops note:

```
date | bootstrap | classified_24h | suspicious_share | top_3_subreasons | sample_n | A/B/C/D counts | decision
```

---

## Sub-reason quick reference

| Category | Sub-reasons | Operator stance |
|----------|-------------|-----------------|
| Benign | `url_match_same_dates`, `url_match_same_payload`, `url_match_refresh_queued`, `soft_dedupe_exact_address_date` | Informational |
| Suspicious | `url_match_dates_changed`, `url_match_location_changed`, `url_match_content_changed`, `soft_dedupe_cross_city`, `gated_false_positive`, `expired_false_positive`, cross-provider duplicates, `unknown` | Sample when share ≥ 15% |
| Operational | `url_match_expired_row`, `url_match_superseded_row`, `invalid_detail_payload`, `repair_pending`, `publish_failed` | Expected backlog; fix via repair/publish crons |

Full enum: `lib/ingestion/acquisition/externalCrawlSkipTaxonomy.ts`.

---

## Hard rules (scope freeze)

- **No** global dedupe threshold changes to “fix” suspicious share.
- **No** force-publish of gated rows.
- **No** parser rewrites during stabilization unless a sampled **C** case is proven.
- Fix **code only** with a narrow change + test tied to the confirmed sub-reason.

---

## Exit criteria (Workstream E)

- Suspicious share **< 15%** for 7 consecutive days, **or**
- Formal benign documentation (sample table + ops log entry) accepted for Tier 2 while bootstrap/catch-up continues.
