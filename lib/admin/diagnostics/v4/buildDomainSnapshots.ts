import type { IngestionFunnelStageId } from '@/lib/admin/ingestionFunnelMetricsHelpers'
import type {
  BacklogSnapshot,
  CatalogRepairSnapshot,
  DuplicateHealthSnapshot,
  PipelineStageSnapshot,
  VisibilitySnapshot,
} from '@/lib/admin/diagnostics/v4/types'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS, VISIBLE_DUPLICATE_RATE_MAX } from '@/lib/admin/diagnostics/v4/constants'

function stageCount(
  metrics: IngestionMetricsResponse,
  id: IngestionFunnelStageId
): number {
  return metrics.funnel['24h'].stages.find((s) => s.id === id)?.count ?? 0
}

export function buildPipelineSnapshot(metrics: IngestionMetricsResponse): PipelineStageSnapshot[] {
  const df = metrics.funnel['24h'].detailFirst
  const published = stageCount(metrics, 'published')
  const visibleProxy = metrics.published24h

  return [
    { stage: 'Discovered', count24h: stageCount(metrics, 'discovered'), available: true },
    {
      stage: 'Fetched',
      count24h: df.attempted,
      available: true,
    },
    {
      stage: 'Parsed',
      count24h: df.succeeded,
      available: true,
    },
    { stage: 'Inserted', count24h: stageCount(metrics, 'inserted'), available: true },
    { stage: 'Published', count24h: published, available: true },
    {
      stage: 'Visible',
      count24h: visibleProxy,
      available: true,
    },
  ]
}

export function buildCatalogRepairSnapshot(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): CatalogRepairSnapshot {
  const queueTotal =
    coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0
  const needsCheck = metrics.failureBreakdown.needs_check
  const needsGeocode = coverage?.catalogRepair.needsGeocode ?? metrics.volume.geocode.needsGeocodeCount
  const publishFailed = metrics.failureBreakdown.publish_failed
  const repairFailed = coverage?.catalogRepair.repairFailed ?? 0
  const addressEnrichment = metrics.volume.addressLifecycle.enrichmentBacklog

  let dominantBlocker: string | null = null
  const analysis = metrics.needsCheckRootCauseAnalysis
  if (analysis && analysis.total > 0) {
    const top = Object.entries(analysis.byBlockerCategory)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])[0]
    dominantBlocker = top?.[0] ?? null
  }

  let recommendation = 'Monitor catalog-repair and address enrichment crons.'
  if (queueTotal >= 100) {
    recommendation =
      'Let catalog-repair cron drain; triage needs_check breakdown — no force-publish.'
  } else if (addressEnrichment > 0) {
    recommendation = 'Confirm address enrichment worker; listings may be gated until unlock.'
  }

  return {
    queueTotal,
    needsCheck,
    needsGeocode,
    publishFailed,
    repairFailed,
    addressEnrichment,
    dominantBlocker,
    recommendation,
  }
}

export function buildVisibilitySnapshot(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): VisibilitySnapshot {
  const publishedNotVisibleTotal =
    coverage?.falseExclusionAudit.byPrimaryBucket.published_not_visible ?? 0
  const audit = metrics.publishedNotVisibleDistributionAnalysis

  if (audit) {
    const analysis = audit.analysis
    const observationStale = analysis.observationStaleTagCount
    const trueFailure =
      analysis.byBucket.MISMATCH +
      analysis.byBucket.NO_MATCHED_SALE +
      analysis.byBucket.ARCHIVED +
      analysis.byBucket.EXPIRED +
      analysis.byBucket.MODERATION_HIDDEN +
      analysis.byBucket.OTHER
    return {
      observationStale,
      trueVisibilityFailure: trueFailure,
      publishedNotVisibleTotal,
    }
  }

  return {
    observationStale: publishedNotVisibleTotal,
    trueVisibilityFailure: 0,
    publishedNotVisibleTotal,
  }
}

export function buildDuplicateHealthSnapshot(
  coverage: YstmCoverageMetricsResponse | null
): DuplicateHealthSnapshot {
  const publishedActive = coverage?.publishedActiveLootAuraYstmUrls ?? 0
  const visibleClusters = coverage?.falseExclusionSaleIdentity.duplicateVisibleSaleClusters24h ?? 0
  return {
    canonicalPublishClusters:
      coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? 0,
    convergenceStreakDays:
      coverage?.crossProviderConvergence.sloAttainment?.consecutiveZeroDuplicateDays ?? 0,
    convergenceStreakTargetDays: DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS,
    visibleDuplicateClusters: visibleClusters,
    visibleDuplicateRate: publishedActive > 0 ? visibleClusters / publishedActive : null,
    shadowDivergenceCount:
      coverage?.saleInstanceShadowReplay.divergenceOldSuppressNewPublishCount ?? 0,
  }
}

export function buildBacklogSnapshot(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): BacklogSnapshot {
  return {
    catalogRepair:
      coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0,
    publishFailed: metrics.failureBreakdown.publish_failed,
    geocodeEligible: metrics.geocodeEligibleBacklog,
    geocodeBacklog: metrics.backlog,
    addressEnrichment: metrics.volume.addressLifecycle.enrichmentBacklog,
    refreshStale:
      coverage?.pipelineBacklog.existingRefreshStale ?? coverage?.existingRefresh.staleOver12h ?? 0,
    imageBacklog: metrics.volume.imageEnrichment.backlog,
    missingIngest:
      coverage?.pipelineBacklog.missingIngestionQueue ??
      coverage?.missingIngestion.missingQueueTotal ??
      0,
  }
}

export function exceedsVisibleDuplicateThreshold(rate: number | null): boolean {
  return rate != null && rate >= VISIBLE_DUPLICATE_RATE_MAX
}
