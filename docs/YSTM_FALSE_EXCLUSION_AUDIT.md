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

## Later phases

Phases 3+ introduce sale-instance identity and remove URL-only suppression.
