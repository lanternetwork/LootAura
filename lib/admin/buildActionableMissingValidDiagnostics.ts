import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export function buildActionableMissingValidDiagnostics(
  coverage: YstmCoverageMetricsResponse | null
): string | null {
  const metrics = coverage?.actionableMissingValid
  if (!metrics) return null

  const lines = [
    '## ACTIONABLE MISSING VALID',
    diagnosticBullet('raw_missing_valid', metrics.rawMissingValidYstmUrls),
    diagnosticBullet('effective_missing_valid', metrics.effectiveMissingValidYstmUrls),
    diagnosticBullet('actionable_missing_valid', metrics.actionableMissingValidYstmUrls),
    diagnosticBullet('terminal_disposition', metrics.terminalDispositionCount),
    diagnosticBullet('visibility_filter_zombie', metrics.visibilityFilterZombieCount),
    diagnosticBullet('expired_inventory', metrics.expiredInventoryCount),
    diagnosticBullet('stale_observation', metrics.staleObservationCount),
    diagnosticBullet('recoverable', metrics.recoverableCount),
    diagnosticBullet(
      'missing_ingest_fetch_failed_retryable',
      metrics.missingIngestFetchFailedRetryableCount
    ),
    diagnosticBullet('duplicate_suppressed', metrics.duplicateSuppressedCount),
    diagnosticBullet('unknown_actionable', metrics.unknownActionableCount),
    diagnosticBullet('unknown_non_actionable', metrics.unknownNonActionableCount),
  ]

  return lines.join('\n')
}
