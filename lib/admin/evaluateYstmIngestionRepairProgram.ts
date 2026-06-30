import { evaluateYstmSaleInstanceRolloutGates } from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  evaluateYstmStabilizationExit,
  STABILIZATION_CANONICAL_COVERAGE_MIN_PCT,
  STABILIZATION_CATALOG_REPAIR_MAX,
  STABILIZATION_MISSING_VALID_NEAR_ZERO,
  STABILIZATION_TIER1_HOLD_DAYS,
} from '@/lib/admin/ystmStabilizationExitCriteria'
import {
  CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING,
  CRAWL_SKIP_TAXONOMY_MIN_SAMPLES,
} from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'
import type { FalseExclusionTraceBucket } from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'

/** Client-safe mirror of `YSTM_COVERAGE_TARGET_PCT` in ystmCoverageValidity.ts. */
const YSTM_COVERAGE_TARGET_PCT = 90

export type RepairWorkstreamStatus = 'blocked' | 'ready' | 'watch' | 'info'

export type RepairWorkstreamCard = {
  id: string
  title: string
  priority: 'P0' | 'P1' | 'P2'
  status: RepairWorkstreamStatus
  metric: string
  action: string
  acceptanceMet: boolean
}

export type RepairFalseExclusionBucketRow = {
  bucket: FalseExclusionTraceBucket | string
  count: number
  action: string
}

export type YstmIngestionRepairProgramSnapshot = {
  tier1Ready: boolean
  tier2RepairReady: boolean
  seoUnblockTier1Ready: boolean
  holdNote: string
  workstreams: RepairWorkstreamCard[]
  falseExclusionBuckets: RepairFalseExclusionBucketRow[]
  topMissingBucketTotal: number
}

const FALSE_EXCLUSION_ACTIONS: Partial<Record<FalseExclusionTraceBucket, string>> = {
  detail_first_fallback:
    'Missing-ingest cron; triage missing_ingestion_failure_reason — do not weaken precision gates.',
  repair_pending: 'Workstream B — let catalog-repair cron drain; no force-publish.',
  published_not_visible:
    'Investigate visibility (ends_at, precision, moderation, stale obs) — no blind republish.',
  url_reuse_suspected: 'Existing-refresh + supersession review.',
  repair_failed: 'Inspect repair_failed rows; re-queue via catalog repair when eligible.',
  address_validation_failed: 'Address enrichment / validation path — see needs_check breakdown.',
  spatial_lookup_failed: 'Spatial resolution backlog — confirm enrichment crons.',
  publish_failed: 'Terminal publish_failed triage — do not bypass gates.',
}

function workstream(
  id: string,
  title: string,
  priority: RepairWorkstreamCard['priority'],
  status: RepairWorkstreamStatus,
  metric: string,
  action: string,
  acceptanceMet: boolean
): RepairWorkstreamCard {
  return { id, title, priority, status, metric, action, acceptanceMet }
}

function sortedFalseExclusionBuckets(
  coverage: YstmCoverageMetricsResponse
): RepairFalseExclusionBucketRow[] {
  return Object.entries(coverage.falseExclusionAudit.byPrimaryBucket)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([bucket, count]) => ({
      bucket,
      count,
      action:
        FALSE_EXCLUSION_ACTIONS[bucket as FalseExclusionTraceBucket] ??
        'Trace in Debug → coverage scoreboard; follow false-exclusion runbook.',
    }))
}

/**
 * YSTM ingestion repair program (PR #532) — workstreams A–G and SEO allowlist unblock path.
 * Pure evaluation from loaded dashboard payloads — no I/O.
 */
export function evaluateYstmIngestionRepairProgram(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): YstmIngestionRepairProgramSnapshot {
  const stabilization = evaluateYstmStabilizationExit(metrics, coverage)
  const rollout = coverage ? evaluateYstmSaleInstanceRolloutGates(coverage) : null

  const duplicateClusters = coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  const canonicalPct = coverage?.canonicalSaleInstance.canonicalCoveragePct ?? null
  const repairQueue =
    coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0
  const missing = coverage?.missingValidYstmUrls ?? null
  const coveragePct = coverage?.coveragePct ?? null
  const addressEnrichment = metrics.volume.addressLifecycle?.enrichmentBacklog ?? 0
  const needsCheck = metrics.failureBreakdown.needs_check
  const refreshStale =
    coverage?.pipelineBacklog.existingRefreshStale ?? coverage?.existingRefresh.staleOver12h ?? 0
  const shadowDivergence = coverage?.saleInstanceShadowReplay.divergenceOldSuppressNewPublishCount ?? null
  const matchMethodMissing = coverage?.falseExclusionSaleIdentity.coverageWithoutMatchMethod ?? null
  const publishedActive = coverage?.publishedActiveLootAuraYstmUrls ?? 0
  const visibleDupClusters = coverage?.falseExclusionSaleIdentity.duplicateVisibleSaleClusters24h ?? 0
  const visibleDupRate = publishedActive > 0 ? visibleDupClusters / publishedActive : 0

  const crawl = metrics.volume.fetch?.crawlSkipTaxonomy24h ?? emptyCrawlSkipTaxonomyRollup()
  const suspiciousShare =
    crawl && crawl.total >= CRAWL_SKIP_TAXONOMY_MIN_SAMPLES ? crawl.suspicious / crawl.total : null

  const tier2RepairReady =
    rollout != null &&
    rollout.enforcementReady &&
    canonicalPct != null &&
    canonicalPct >= STABILIZATION_CANONICAL_COVERAGE_MIN_PCT &&
    visibleDupRate < 0.005 &&
    (shadowDivergence ?? 1) === 0 &&
    (matchMethodMissing ?? 1) === 0

  const workstreams: RepairWorkstreamCard[] = [
    workstream(
      'A',
      'Duplicate canonical publish clusters',
      'P0',
      duplicateClusters == null ? 'info' : duplicateClusters > 0 ? 'blocked' : 'ready',
      duplicateClusters == null
        ? 'Convergence data unavailable'
        : `${duplicateClusters} cluster(s) (sustain 0 daily)`,
      duplicateClusters != null && duplicateClusters > 0
        ? 'Remediate in Debug → duplicate clusters before canonical backfill.'
        : 'SLO clear — sustain 7 consecutive UTC days before backfill batches.',
      duplicateClusters === 0
    ),
    workstream(
      'B',
      'Catalog repair & address enrichment drain',
      'P0',
      repairQueue >= STABILIZATION_CATALOG_REPAIR_MAX || needsCheck > repairQueue * 0.9 ? 'watch' : 'ready',
      `${repairQueue.toLocaleString()} repair queue · ${needsCheck.toLocaleString()} needs_check · ${addressEnrichment.toLocaleString()} address enrichment`,
      'Let catalog-repair + daily enrichment crons drain; triage needs_check breakdown 2×/week — no force-publish.',
      repairQueue < STABILIZATION_CATALOG_REPAIR_MAX
    ),
    workstream(
      'C',
      'Missing valid URL closure',
      'P0',
      missing == null || coveragePct == null
        ? 'info'
        : missing <= STABILIZATION_MISSING_VALID_NEAR_ZERO && coveragePct >= YSTM_COVERAGE_TARGET_PCT
          ? 'ready'
          : 'watch',
      missing == null || coveragePct == null
        ? 'Coverage unavailable'
        : `${missing.toLocaleString()} missing · ${coveragePct.toFixed(1)}% coverage (targets ≤${STABILIZATION_MISSING_VALID_NEAR_ZERO}, ≥${YSTM_COVERAGE_TARGET_PCT}%)`,
      'Drive false-exclusion buckets below; missing-ingest + repair in parallel.',
      missing != null &&
        coveragePct != null &&
        missing <= STABILIZATION_MISSING_VALID_NEAR_ZERO &&
        coveragePct >= YSTM_COVERAGE_TARGET_PCT
    ),
    workstream(
      'D',
      'Convergence & Phase 14 identity',
      'P1',
      rollout == null || !rollout.enforcementReady ? 'watch' : 'ready',
      canonicalPct == null
        ? 'Canonical coverage unavailable'
        : `${canonicalPct.toFixed(1)}% canonical · ${visibleDupClusters} visible-dup clusters (${(visibleDupRate * 100).toFixed(2)}%) · ${shadowDivergence ?? '—'} shadow divergence`,
      'Canonical backfill only when clusters = 0; re-run coverage audit for match_method; review shadow divergence.',
      tier2RepairReady
    ),
    workstream(
      'E',
      'Crawl-skip triage',
      'P2',
      suspiciousShare == null
        ? 'info'
        : suspiciousShare >= CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING
          ? 'watch'
          : 'ready',
      suspiciousShare == null
        ? crawl.total < CRAWL_SKIP_TAXONOMY_MIN_SAMPLES
          ? `Insufficient classified skips (n=${crawl.total})`
          : '—'
        : `${(suspiciousShare * 100).toFixed(1)}% suspicious of ${crawl.total.toLocaleString()} classified skips`,
      'Sample url_match_dates_changed skips; document benign bootstrap skips when applicable.',
      suspiciousShare == null || suspiciousShare < CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING
    ),
    workstream(
      'F',
      'Refresh stale control',
      'P2',
      refreshStale > 0 ? 'watch' : 'ready',
      `${refreshStale.toLocaleString()} stale >12h`,
      'Track daily trend; do not raise existing-refresh throughput until repair <100.',
      refreshStale === 0
    ),
    workstream(
      'G',
      'SEO metro qualification',
      'P1',
      stabilization.tier1Ready ? 'watch' : 'info',
      'See SEO operational panel — target ≥1 qualified metro after allowlist (L) passes.',
      'Dense footprints ≥15 listings; qualification organic via Workstreams B–C.',
      false
    ),
  ]

  const falseExclusionBuckets = coverage ? sortedFalseExclusionBuckets(coverage) : []
  const topMissingBucketTotal = falseExclusionBuckets.reduce((sum, row) => sum + row.count, 0)

  return {
    tier1Ready: stabilization.tier1Ready,
    tier2RepairReady,
    seoUnblockTier1Ready: stabilization.tier1Ready,
    holdNote: `Tier 1 requires ${STABILIZATION_TIER1_HOLD_DAYS} consecutive daily passes before SEO allowlist (L) can unlock indexing prep. Snapshot only — track hold in ops log.`,
    workstreams,
    falseExclusionBuckets,
    topMissingBucketTotal,
  }
}
