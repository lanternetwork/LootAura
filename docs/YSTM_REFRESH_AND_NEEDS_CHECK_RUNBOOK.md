# YSTM refresh + needs_check runbook (Workstreams F/G — Phases 6–7)

**Purpose:** Keep YSTM ingestion in a “hands-off” posture by (a) preventing **refresh stale** drift on already-known external URLs and (b) keeping `needs_check` **bounded and explainable** without weakening global dedupe or force-publishing gated rows.

**Where to look (dashboard):**

- **Overview → Queue health**: `Refresh stale`, `Needs check`
- **Coverage scoreboard → Existing URL refresh (Phase 4)**: `staleOver12h`, `neverSynced`, `syncedLast24h`
- **Debug → Needs check (D2)**: `failureBreakdown.needs_check` (top-level count)

**Related docs:** [`YSTM_HANDS_OFF_STEADY_STATE_PROGRAM.md`](./YSTM_HANDS_OFF_STEADY_STATE_PROGRAM.md), [`OPERATIONS.md`](./OPERATIONS.md), [`EXTERNAL_SOURCE_COVERAGE_SPEC.md`](./EXTERNAL_SOURCE_COVERAGE_SPEC.md)

---

## 1) Refresh stale backlog control (Workstream F / Phase 6)

### What the metric means

- **Refresh stale** is the count of known YSTM detail URLs that are **>12h since `last_source_sync_at`** (scoreboard field `existingRefresh.staleOver12h`).
- The refresh queue is **all non-expired external ingested rows**, but the cron only attempts rows that are eligible for refresh based on `last_source_sync_at` and the stale threshold.

### What actually runs

- **Route:** `GET/POST /api/cron/ystm-existing-refresh`
- **Runner:** `runYstmExistingUrlRefreshCron`
- **Candidate ordering:** stale/never-synced first (`last_source_sync_at` nulls-first), then **published** ingested rows (coverage regression risk), then `source_url`.
- **Overlap prevention:** lease key `ystm_coverage_existing_refresh`

### Guardrails (don’t do this)

- **Do not** raise refresh throughput before catalog repair is stable (program rule: repair <100).
- **Do not** chase refresh stale by weakening dedupe or force-publishing gated rows (that shifts problems, it doesn’t fix them).

### Operator actions (when refresh stale grows while bootstrap is OFF)

1. **Confirm the cron is running** (see `vercel.json` schedule for `/api/cron/ystm-existing-refresh`).
2. **Confirm it is making progress**: the route returns aggregate telemetry (`refreshAttempts`, `refreshed`, `published`, `markedExpired`, `failed`, `skippedFresh`).
3. **Only after repair is stable**, consider tuning:
   - `CRON_YSTM_EXISTING_REFRESH_MAX_ATTEMPTS`
   - `CRON_YSTM_EXISTING_REFRESH_MAX_SCANNED`
   - `CRON_YSTM_EXISTING_REFRESH_STALE_HOURS` (default 12)

### Success signal

- `existingRefreshStale` is **flat/down** over the last ~14 days (Tier 2 workstream exit) and does not correlate with missing growth when bootstrap is OFF.

---

## 2) `needs_check` policy (Workstream G / Phase 7)

### What `needs_check` actually is (not one thing)

`needs_check` is a **bucket**, not a single failure mode. In this codebase, it commonly includes:

1. **Publish gate: non-publishable coordinate precision**
   - If `coordinate_precision` is `locality` or `city_centroid`, publish will park the row in `needs_check` (reason `non_publishable_precision`).
2. **Address gated / enrichment pending**
   - When an address is gated or missing enough to geocode, the ingestion lifecycle resolves to `needs_check` until unlock/enrichment.
3. **Geocode terminal outcomes (dead-letter)**
   - Some `needs_check` rows include a structured `failure_details.geocode_dead_letter` envelope. A bounded cron/admin replay can move **transient-provider** terminal rows back to `needs_geocode` after cooldown.

### What actually runs

- **Catalog repair** includes `needs_check` in its candidate set, but `needs_check` rows are treated as **terminal for repair follow-up** (`needs_check_terminal`). Repair is primarily for rows that can be refreshed/geocoded/published.
- **Geocode cron** has a bounded **dead-letter replay** step:
  - Replays are **skipped** when 429 pressure is high (`GEOCODE_CRON_REPLAY_MAX_429` gate).
  - Replay is **bounded** by `GEOCODE_CRON_REPLAY_LIMIT` (default 50; cap 200).
  - Per-row replay is capped (`DEFAULT_MAX_GEOCODE_DEAD_LETTER_REPLAYS = 4`) and respects a replay cooldown.

### Guardrails (don’t do this)

- **Do not** “fix” `needs_check` by allowing low-precision publishes. The precision policy is an explicit product quality gate.
- **Do not** force-publish address-gated rows; they should wait for enrichment/unlock.
- **Do not** globally weaken dedupe or convergence logic to reduce `needs_check` counts.

### Operator actions (when `needs_check` is rising)

1. **Treat it as a bucket**: confirm whether the spike is driven by catalog repair, publish precision gating, address gating, or geocode dead-letter.
2. **If geocode 429 is elevated**, expect dead-letter replay to pause; allow geocode backlog pressure to normalize before expecting replay to drain transient-provider `needs_check`.
3. **If repair queue is elevated**, drain repair first; avoid shifting effort to `needs_check` while repair is still driving primary visibility.

### Success signal

- `needs_check` remains **bounded and explainable** at steady-state (Workstream G exit criterion).

