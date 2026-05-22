# YSTM false-exclusion audit (Phase 1)

Ground-truth tracing for **valid active YSTM URLs** that are not visible in the coverage audit footprint.

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
| `url_reuse_suspected` | Expired ingested row but YSTM still valid-active |
| `soft_dedupe_suppressed` | `ingested_sales.is_duplicate` |
| `expired_false_positive` | Marked expired while YSTM valid-active |
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

On each admin load of **YSTM nationwide coverage** (`buildYstmCoverageScoreboard`), all missing valid URLs are traced, persisted on `ystm_coverage_observations`, and summarized in `falseExclusionAudit` on the API response.

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

**Key formula (YSTM detail URLs):** `platform:state|city|address:dateStart|dateEnd:listingId` (content-hash tail when listing id missing). Title is never used alone.

**Population:** New inserts via `externalPageSource` and detail-first paths call `computeYstmSaleInstanceIdentity` — **no dedupe or URL-uniqueness change** until Phase 5–10.

**Admin:** YSTM scoreboard section **Sale-instance identity (Phase 3)** shows rows with keys and collision groups.

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

## Phase 7 — crawl gate reorder (YSTM detail-first before URL skip)

For YSTM **detail** listing URLs, list crawl no longer applies URL-only duplicate skip when the per-page refresh budget is exhausted. Those rows are deferred to **detail-first** so `classifySaleInstance` runs on authoritative detail HTML before any suppress decision.

Non-YSTM URLs and superseded rows keep the prior URL-only skip path.

### Code

- `mustClassifyViaYstmDetailFirstBeforeUrlSkip` in `detailFirstCrawlPolicy.ts`
- `externalPageSource.ts` list loop

## Later phases

Phases 8–10 add soft dedupe hardening, shadow mode, and constraints.
