# external marketplace false-exclusion audit (Phase 1)

Ground-truth tracing for **valid active external marketplace URLs** that are not visible in the coverage audit footprint.

## Replay queue

```text
ystm_coverage_observations
WHERE ystm_valid_active = true AND lootaura_visible = false
```

Aggregated as `missingValidYstmUrls` on the admin scoreboard.

## Primary buckets

Each missing URL gets **exactly one** primary bucket:

| Bucket | Meaning |
|--------|---------|
| `never_crawled` | No crawlable config or never crawled |
| `crawl_not_yet_rotated` | Config crawlable; listing not ingested yet |
| `url_duplicate_suppressed` | Skipped as existing URL / duplicate path |
| `url_reuse_suspected` | Expired ingested row but external marketplace still valid-active |
| `soft_dedupe_suppressed` | `ingested_sales.is_duplicate` |
| `expired_false_positive` | Marked expired while external marketplace valid-active |
| `gated_false_positive` | Address-gated row |
| `detail_first_fallback` | Missing-ingest detail-first fallback |
| `address_validation_failed` | Missing-ingest validation failure |
| `spatial_lookup_failed` | Missing-ingest spatial failure |
| `insert_failed` | Insert failure |
| `publish_failed` | `publish_failed` status |
| `repair_pending` | Ingested but not published/visible |
| `repair_failed` | Catalog repair failed |
| `published_not_visible` | Published or stale observation vs visibility index |
| `unknown` | Unclassified — investigate |

Secondary tags (`false_exclusion_secondary_tags`) add context without changing the primary bucket.

## When traces run

On each admin load of **external marketplace nationwide coverage** (`buildYstmCoverageScoreboard`), all missing valid URLs are traced, persisted on `ystm_coverage_observations`, and summarized in `falseExclusionAudit` on the API response.

## Code

- `lib/ingestion/ystmCoverage/classifyFalseExclusionTrace.ts`
- `lib/ingestion/ystmCoverage/buildFalseExclusionAuditReport.ts`
- Migration `201_ystm_false_exclusion_trace_phase_1.sql`

## Phase 2 — crawl skip taxonomy (observability)

External crawl records **sub-reasons** on each skip path without changing suppression behavior.

### Categories

| Category | Examples | Dashboard |
|----------|----------|-----------|
| **Benign** | `url_match_same_dates`, `url_match_refresh_queued`, `soft_dedupe_exact_address_date` | Informational |
| **Suspicious** | `url_match_dates_changed`, `url_match_location_changed`, `soft_dedupe_cross_city`, `gated_false_positive` | Alert when share ≥15% of classified skips (n≥20) |
| **Operational** | `url_match_expired_row`, `invalid_detail_payload`, `publish_failed` | Expected pipeline state |

### Where it appears

- Orchestration notes: `crawlSkipSubReasons`, `crawlSkipSuspicious`, `crawlSkipBenign` (daily external ingest)
- Admin ingestion dashboard: **Crawl skip taxonomy (Phase 2)** section
- Diagnostics export: `## Phase 2 — crawl skip taxonomy (24h)`

### Code

- `lib/ingestion/acquisition/externalCrawlSkipTaxonomy.ts` — sub-reason enum + classifiers
- `lib/ingestion/adapters/externalPageSource.ts` — per-listing telemetry on skip paths
- `lib/admin/crawlSkipTaxonomyMetrics.ts` — 24h rollup from orchestration runs
- `lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth.ts` — suspicious-share alerts

## Phase 3 — sale-instance identity schema (observability)

Migration `202_ystm_sale_instance_identity_phase_3.sql` adds identity columns on `ingested_sales`:

- `source_listing_id`, `sale_instance_key`, `sale_instance_fingerprint`
- Content/schedule/location/payload hashes
- `source_url_first_seen_at` / `source_url_last_seen_at`
- Supersession placeholders (`supersedes_*`, `superseded_*`) for Phase 5+

**Key formula (external marketplace detail URLs):** `platform:state|city|address:dateStart|dateEnd:listingId` (content-hash tail when listing id missing). Title is never used alone.

**Population:** New inserts via `externalPageSource` and detail-first paths call `computeYstmSaleInstanceIdentity` — **no dedupe or URL-uniqueness change** until Phase 5–10.

**Admin:** external marketplace scoreboard section **Sale-instance identity (Phase 3)** shows rows with keys and collision groups.

### Code

- `lib/ingestion/identity/computeYstmSaleInstanceIdentity.ts`
- `lib/ingestion/identity/ystmSourceListingId.ts`
- `lib/admin/saleInstanceIdentityMetrics.ts`

## Phase 4 — source URL alias history (observability)

Migration `203_ystm_ingested_sale_source_urls_phase_4.sql` adds `ingested_sale_source_urls`:

- One row per `(ingested_sale_id, canonical_source_url)`; revisits update `last_seen_at`
- Fields: `source_platform`, `source_url`, `canonical_source_url`, `source_listing_id`, `payload_hash`, `is_current`

**Population:** `recordIngestedSaleSourceUrl` on new inserts (`externalPageSource`, detail-first) and when list crawl sees an existing `source_url` row (timestamp refresh only).

**No** change to `UNIQUE(source_url)` on `ingested_sales` (Phase 10).

### Code

- `lib/ingestion/identity/recordIngestedSaleSourceUrl.ts`
- `lib/admin/sourceUrlAliasMetrics.ts`

## Phase 5 — date-aware URL reuse (behavior)

When list crawl sees an existing `source_url`, classify reuse **before** duplicate skip:

| Event | Action |
|-------|--------|
| Same dates (±3d) / same location | Routine bounded detail refresh |
| Materially different dates or location | **Priority** detail refresh (bypasses per-page refresh cap) |
| Expired row + active listing dates | Priority refresh (new event) |

On detail-first refresh, when `sale_instance_key` changes (or list classification is `new_event_same_url`) and a published sale exists:

- Set `superseded_sale_id` / `superseded_reason` on `ingested_sales`
- End prior `sales.ends_at` (hide old pin)
- Clear `published_sale_id` so publish creates the new visible instance

`UNIQUE(source_url)` unchanged (Phase 10).

### Code

- `lib/ingestion/identity/classifyYstmUrlReuseEvent.ts`
- `lib/ingestion/identity/ystmUrlReuseSupersession.ts`
- `lib/ingestion/acquisition/detailFirstCrawlPolicy.ts` (`shouldQueueYstmListRecrawlRefresh`)

## Phase 6 — sale-instance classifier

`classifySaleInstance` is the identity-first decision engine (not URL-only):

| Priority | Signal |
|----------|--------|
| 1 | `sale_instance_key` |
| 2 | `source_listing_id` + overlapping dates |
| 3 | Normalized address + overlapping dates |
| 4 | Location bucket + coordinates + dates |
| 5 | `source_url` history (existing row at URL) |

**Decisions:** `same_event_no_change`, `same_event_updated`, `new_event_same_url`, `new_event_new_url`, `stale_event_expired`, `invalid_event`, `ambiguous_requires_review`.

**Wiring:** Phase 5 list refresh and detail-first supersession delegate to this module. Emits `ingestion.sale_instance.classified` telemetry on list recrawl and detail-first refresh.

### Code

- `lib/ingestion/identity/classifySaleInstance.ts`

## Phase 7 — crawl gate reorder (external marketplace detail-first before URL skip)

For external marketplace **detail** listing URLs, list crawl no longer applies URL-only duplicate skip when the per-page refresh budget is exhausted. Those rows are deferred to **detail-first** so `classifySaleInstance` runs on authoritative detail HTML before any suppress decision.

Non-external marketplace URLs and superseded rows keep the prior URL-only skip path.

### Code

- `mustClassifyViaYstmDetailFirstBeforeUrlSkip` in `detailFirstCrawlPolicy.ts`
- `externalPageSource.ts` list loop

## Phase 8 — soft dedupe safety

Weak address/title scoring can no longer suppress when identity signals disagree:

| Block reason | Trigger |
|--------------|---------|
| `date_start_beyond_3_day_tolerance` | Start dates >3 calendar days apart |
| `date_windows_no_overlap` | Sale windows do not overlap within tolerance |
| `source_listing_id_materially_different` | external marketplace listing id (or external id) mismatch |
| `sale_instance_key_mismatch` | Distinct `sale_instance_key` on both sides |
| `coordinate_bucket_materially_different` | Location hash / geo bucket mismatch |
| `expired_winner_valid_incoming_coords` | Expired ingested row + valid native coords on incoming |

Every allowed suppression is persisted on `ingested_sale_soft_dedupe_suppressions` with score, breakdown, `duplicate_of_ingested_sale_id`, and sale-instance keys.

### Code

- `lib/ingestion/identity/softDedupeSafety.ts`
- `lib/ingestion/identity/recordSoftDedupeSuppression.ts`
- `lib/ingestion/dedupe.ts` (list skip + `findIngestedSaleMatch`)
- Migration `204_ystm_soft_dedupe_suppression_evidence_phase_8.sql`

## Phase 9 — sale-instance shadow mode

Replay every `missingValidYstmUrls` row through:

| Path | Behavior modeled |
|------|------------------|
| **Legacy URL gate** | `source_url` exists → duplicate skip (`oldWouldSuppress`) |
| **New classifier** | `classifySaleInstance` decision + publish/revive signals |

Telemetry fields: `oldDecision`, `newDecision`, `wouldPublish`, `wouldCreateNewInstance`, `wouldSuppress` (legacy), `newWouldSuppress`, `confidence`, `reasonCodes`.

**Persisted:** `ystm_sale_instance_shadow_replays` (upsert per canonical URL). **Live crawl:** `ingestion.sale_instance.shadow_compared` on list recrawl when an existing URL row is seen (no behavior change).

### Code

- `lib/ingestion/identity/shadowSaleInstanceReplay.ts`
- `lib/ingestion/ystmCoverage/buildSaleInstanceShadowReplayReport.ts`
- Admin scoreboard section + diagnostics export
- Migration `205_ystm_sale_instance_shadow_replay_phase_9.sql`

## Phase 10 — schema constraint migration

`source_url` is no longer globally unique on `ingested_sales`. Active sale instances are enforced by:

```text
UNIQUE(source_platform, sale_instance_key)
WHERE superseded_by_ingested_sale_id IS NULL
```

Duplicate active keys are superseded in migration before the partial unique index is created. Lookups by `source_url` use the primary non-superseded row (deterministic smallest id).

### Code

- `supabase/migrations/206_ystm_schema_constraints_phase_10.sql`
- `lib/ingestion/identity/ingestedSaleSourceUrlLookup.ts`
- `lib/ingestion/identity/resolveIngestedSaleInsertCollision.ts`

## Phase 11 — coverage audit alignment

Coverage audit `lootaura_visible` is determined by **sale instance**, not URL alone. Observations store identity and match metadata:

| Column | Purpose |
|--------|---------|
| `source_listing_id`, `sale_instance_key` | external marketplace identity from detail parse |
| `matched_ingested_sale_id`, `matched_sale_id` | Visible LootAura footprint hit |
| `match_method` | `sale_instance_key`, `source_listing_id_date_overlap`, `source_url_alias`, `source_url_visible`, `normalized_address_date` |

Match order: sale instance key → listing id + overlapping dates → URL alias (with instance agreement) → direct URL (with instance agreement when identity known) → address/date fallback.

Stale published rows at a reused URL no longer count as covered when the active external marketplace event has a different `sale_instance_key`.

### Code

- `supabase/migrations/207_ystm_coverage_audit_instance_match_phase_11.sql`
- `lib/ingestion/ystmCoverage/loadYstmCoverageLootAuraMatchIndex.ts`
- `lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint.ts`
- `lib/ingestion/ystmCoverage/runYstmCoverageAuditCron.ts`

## Phase 12 — sale-instance identity backfill

Bounded backfill for existing `ingested_sales` rows missing `sale_instance_key`:

- Derives `source_listing_id`, content/schedule/location hashes, and `sale_instance_key`
- Records `ingested_sale_source_urls` alias rows
- Detects active-key collisions and URL reuse conflicts (metrics only; does not supersede)

### Run

- Admin: `POST /api/admin/ingested-sales/backfill-sale-instance-identity` with `{ "batchSize": 100, "dryRun": false, "maxRows": 5000 }`
- CLI: `npm run backfill:ystm-sale-instance-identity:dry` then `npm run backfill:ystm-sale-instance-identity`

### Metrics

`rowsBackfilled`, `missingDate`, `missingLocation`, `keyCollisions`, `urlReuseConflicts`, `ambiguousRows`

### Code

- `lib/ingestion/identity/backfillYstmSaleInstanceIdentity.ts`
- `lib/ingestion/identity/remediateYstmSaleInstanceIdentityBacklog.ts`
- `app/api/admin/ingested-sales/backfill-sale-instance-identity/route.ts`

## Phase 13 — false exclusion / sale identity dashboard

Unified admin scoreboard section aggregating replay-queue metrics, 24h crawl-skip taxonomy, shadow classifier counts, soft-dedupe suppressions, coverage `match_method` breakdown, and duplicate-visible address+date clusters.

### Where it appears

- Admin ingestion → **external marketplace nationwide coverage** → **external marketplace false exclusion / sale identity (Phase 13)**
- API field: `falseExclusionSaleIdentity` on `GET /api/admin/ingestion/ystm-coverage`
- Diagnostics export: `### external marketplace false exclusion / sale identity (Phase 13)`

### Alerts (non-blocking)

- Shadow divergence: legacy suppress → new classifier would publish
- Suspicious crawl-skip share ≥15% (when n≥20 classified skips)
- Elevated URL reuse skips (`url_match_dates_changed` + `url_match_expired_row`)
- Duplicate-visible clusters ≥3 (same normalized address + `date_start`)
- All missing valid-active rows lack `match_method` (re-run coverage audit after Phase 11)

### Code

- `lib/admin/ystmFalseExclusionSaleIdentityDashboard.ts`
- `lib/admin/ystmCoverageScoreboard.ts` (wires dashboard on scoreboard build)
- `app/admin/ingestion/YstmCoverageScoreboardSection.tsx`
- `lib/admin/buildYstmCoverageDiagnostics.ts`

## Phase 14 — testing and rollout gates

Expanded unit/integration coverage for identity, collision resolution, shadow replay persistence, and classifier edge cases. Admin scoreboard shows **Sale-instance rollout gates** (Stages A–D) derived from the Phase 13 dashboard and shadow replay metrics.

### Rollout gates (scoreboard)

| Gate | Stage | Meaning |
|------|-------|---------|
| Missing URLs traced | A | Phase 1 false-exclusion trace covers replay queue |
| Shadow replay drained | A | All missing valid URLs replayed (Phase 9) |
| No shadow divergence | D | Zero legacy-suppress → new-publish rows before enforcement |
| Active rows with key | C | ≥95% of published-active external marketplace rows have `sale_instance_key` |
| No key collisions | C | No active `sale_instance_key` collision groups |
| Coverage `match_method` | B | Missing valid-active rows have audit match metadata |
| Duplicate-visible SLO | D | Address+date clusters &lt;0.5% of published-active external marketplace |
| Ambiguous bounded | D | ≤5% of replayed rows are `ambiguous_requires_review` |
| Dashboard healthy | A | Phase 13 panel has no operational alerts |

`enforcementReady` is true only when all Stage B–D gates pass.

### Tests added

- `lib/admin/evaluateYstmSaleInstanceRolloutGates.ts` + unit tests
- `tests/unit/ingestion/identity/resolveIngestedSaleInsertCollision.test.ts`
- `tests/unit/ingestion/ystmCoverage/persistSaleInstanceShadowReplay.test.ts`
- Extended `classifySaleInstance.test.ts` (same-event update, ambiguous)

### Code

- `lib/admin/evaluateYstmSaleInstanceRolloutGates.ts`
- `app/admin/ingestion/YstmCoverageScoreboardSection.tsx`
- `lib/admin/buildYstmCoverageDiagnostics.ts`

## Stage D — classifier enforcement (opt-in)

When `INGESTION_YSTM_SALE_INSTANCE_CLASSIFIER_ENFORCE=true`, external marketplace list crawl uses `classifySaleInstance` outcomes (with sale-instance key index) instead of the legacy URL-only duplicate skip path. Default is **off** — no behavior change until rollout gates pass and ops enables the flag.

| Classifier decision | List-crawl action |
|---------------------|-------------------|
| `new_event_same_url`, `same_event_updated`, `ambiguous_requires_review` | Queue detail-first |
| `same_event_no_change`, `stale_event_expired`, `invalid_event` | Duplicate skip (benign / operational sub-reasons) |

Shadow replay + Phase 13 rollout gates should be green before enabling in production.

### Code

- `lib/ingestion/identity/ystmSaleInstanceClassifierEnforcement.ts`
- `lib/ingestion/adapters/externalPageSource.ts` (`list_recrawl_classifier_enforce` telemetry phase)
