import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { emptyMissingValidReconciliationClassCounts } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliationTypes'
import type { SeoEnablementSnapshotRow } from '@/lib/seo/snapshots/types'

/**
 * Minimal YstmCoverageMetricsResponse for evaluateSeoEnablementGate metric inputs.
 */
export function buildCoverageFromEnablementSnapshot(
  snapshot: SeoEnablementSnapshotRow
): YstmCoverageMetricsResponse {
  const byClass = emptyMissingValidReconciliationClassCounts()
  const effectiveMissing = snapshot.effective_missing_valid ?? 0
  byClass.RECOVERABLE = effectiveMissing

  return {
    ok: true,
    targetPct: 90,
    generatedAt: snapshot.updated_at,
    lastAuditAt: null,
    lastAuditStatus: null,
    validActiveYstmUrls: 0,
    publishedActiveLootAuraYstmUrls: snapshot.published_active_inventory ?? 0,
    publishedVisibleInAuditFootprint: 0,
    missingValidYstmUrls: 0,
    coveragePct: snapshot.coverage_pct,
    observationFootprintUrls: 0,
    missingByState: {},
    missingByMetro: {},
    trend: [],
    lastRun: null,
    crossProviderConvergence: {
      duplicatePublishedCanonicalClusters: snapshot.duplicate_canonical_clusters,
    },
    actionableMissingValid: {
      rawMissingValidYstmUrls: effectiveMissing,
      effectiveMissingValidYstmUrls: effectiveMissing,
      actionableMissingValidYstmUrls: effectiveMissing,
      byReconciliationClass: byClass,
      terminalDispositionCount: 0,
      visibilityFilterZombieCount: 0,
      expiredInventoryCount: 0,
      staleObservationCount: 0,
      recoverableCount: effectiveMissing,
      missingIngestFetchFailedRetryableCount: 0,
      duplicateSuppressedCount: 0,
      unknownActionableCount: 0,
      unknownNonActionableCount: 0,
    },
  } as YstmCoverageMetricsResponse
}