import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export function buildMissingIngestFetchFailedDiagnostics(
  coverage: YstmCoverageMetricsResponse | null
): string | null {
  const metrics = coverage?.missingIngestFetchFailed
  if (!metrics) return null

  const lines = [
    '## MISSING INGEST FETCH FAILED',
    diagnosticBullet('missing_ingest_fetch_failed_retryable', metrics.retryableCount),
    diagnosticBullet('retried_last24h', metrics.retriedLast24h),
    diagnosticBullet('successful_replays_last24h', metrics.successfulReplaysLast24h),
    diagnosticBullet('failed_replays_last24h', metrics.failedReplaysLast24h),
    diagnosticBullet('terminalized', metrics.terminalized),
    diagnosticBullet('oldest_last_attempt_at', metrics.oldestLastAttemptAt ?? '—'),
    diagnosticBullet('age_distribution', JSON.stringify(metrics.ageDistribution)),
  ]

  return lines.join('\n')
}
