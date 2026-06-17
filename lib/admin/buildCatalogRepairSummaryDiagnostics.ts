import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export function buildCatalogRepairSummaryDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string {
  const repair = coverage?.catalogRepair
  const repairQueue =
    repair?.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0

  const lines = [
    '## CATALOG REPAIR',
    diagnosticBullet('repair_queue_total', repairQueue),
    diagnosticBullet('needs_check', repair?.needsCheck ?? metrics.failureBreakdown.needs_check),
    diagnosticBullet('needs_geocode', repair?.needsGeocode ?? metrics.volume.geocode.needsGeocodeCount),
    diagnosticBullet('publish_failed', repair?.publishFailed ?? metrics.failureBreakdown.publish_failed),
    diagnosticBullet('repair_failed', repair?.repairFailed ?? 0),
    diagnosticBullet('ready_unpublished', repair?.readyUnpublished ?? 0),
    diagnosticBullet('published_last24h', repair?.repairedPublishedLast24h ?? metrics.published24h),
    diagnosticBullet('missing_valid_urls', coverage?.missingValidYstmUrls ?? '—'),
  ]

  return lines.join('\n')
}
