import { diagnosticsBullet, formatDiagnosticsPct } from '@/lib/admin/diagnosticsMarkdown'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function topMapEntries(map: Record<string, number>, limit: number): string {
  const entries = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
  if (entries.length === 0) return 'none'
  return entries.map(([k, n]) => `${k}=${n}`).join(', ')
}

/**
 * Scoreboard telemetry shown in Debug/Controls but omitted from the original coverage export.
 */
export function buildYstmCoverageTelemetryDiagnostics(
  data: YstmCoverageMetricsResponse
): string {
  const lines: string[] = [
    '## Coverage scoreboard telemetry',
    diagnosticsBullet('target coverage %', data.targetPct),
    diagnosticsBullet('published active LootAura YSTM URLs', data.publishedActiveLootAuraYstmUrls),
    diagnosticsBullet('observation footprint URLs', data.observationFootprintUrls),
    diagnosticsBullet('last audit status', data.lastAuditStatus ?? '—'),
  ]

  if (data.lastRun) {
    lines.push(
      '',
      '### Last coverage audit run',
      diagnosticsBullet('list pages fetched', data.lastRun.listPagesFetched),
      diagnosticsBullet('listing URLs discovered', data.lastRun.listingUrlsDiscovered),
      diagnosticsBullet('detail pages validated', data.lastRun.detailPagesValidated),
      diagnosticsBullet('config cursor after', data.lastRun.configCursorAfter)
    )
  }

  if (!data.operationalHealth.healthy) {
    lines.push('', '### Coverage operational alerts')
    for (const alert of data.operationalHealth.alerts) {
      lines.push(diagnosticsBullet(`${alert.level}: ${alert.code}`, alert.message))
    }
  }

  if (data.trend.length > 0) {
    lines.push('', '### Coverage trend (recent audits)')
    for (const point of data.trend.slice(-8)) {
      lines.push(
        diagnosticsBullet(
          point.completedAt,
          `${formatDiagnosticsPct(point.coveragePct)} · V=${point.validActiveYstmUrls} · visible=${point.publishedVisibleInAudit}`
        )
      )
    }
  }

  lines.push(
    '',
    '### Missing valid URL geography (top)',
    diagnosticsBullet('by state', topMapEntries(data.missingByState, 12)),
    diagnosticsBullet('by metro', topMapEntries(data.missingByMetro, 12)),
    '',
    '### Canonical sale instance (Phase A)',
    diagnosticsBullet(
      'external rows with canonical key',
      data.canonicalSaleInstance.externalRowsWithCanonicalKey
    ),
    diagnosticsBullet(
      'active rows with canonical key',
      data.canonicalSaleInstance.externalActiveRowsWithCanonicalKey
    ),
    diagnosticsBullet(
      'published-active with canonical key',
      data.canonicalSaleInstance.externalPublishedActiveWithCanonicalKey
    ),
    diagnosticsBullet(
      'canonical coverage %',
      data.canonicalSaleInstance.canonicalCoveragePct != null
        ? `${data.canonicalSaleInstance.canonicalCoveragePct.toFixed(1)}%`
        : '—'
    ),
    diagnosticsBullet(
      'canonical collision groups',
      data.canonicalSaleInstance.canonicalCollisionGroups
    ),
    '',
    '### Catalog repair program',
    diagnosticsBullet('repair queue total', data.catalogRepair.repairQueueTotal),
    diagnosticsBullet('needs geocode', data.catalogRepair.needsGeocode),
    diagnosticsBullet('publish failed', data.catalogRepair.publishFailed),
    diagnosticsBullet('needs check', data.catalogRepair.needsCheck),
    diagnosticsBullet('repaired published (24h)', data.catalogRepair.repairedPublishedLast24h),
    diagnosticsBullet('ready unpublished', data.catalogRepair.readyUnpublished),
    diagnosticsBullet('repair failed', data.catalogRepair.repairFailed),
    '',
    '### Existing URL refresh',
    diagnosticsBullet('ystm detail ingested total', data.existingRefresh.ystmDetailIngestedTotal),
    diagnosticsBullet('stale >12h', data.existingRefresh.staleOver12h),
    diagnosticsBullet('synced last 24h', data.existingRefresh.syncedLast24h),
    diagnosticsBullet('never synced', data.existingRefresh.neverSynced),
    '',
    '### Missing ingestion queue',
    diagnosticsBullet('missing queue total', data.missingIngestion.missingQueueTotal),
    diagnosticsBullet('attempted', data.missingIngestion.missingIngestionAttempted),
    diagnosticsBullet('published', data.missingIngestion.missingIngestionPublished),
    diagnosticsBullet('ingested', data.missingIngestion.missingIngestionIngested),
    diagnosticsBullet('failed', data.missingIngestion.missingIngestionFailed),
    diagnosticsBullet('skipped visible', data.missingIngestion.missingIngestionSkippedVisible),
    diagnosticsBullet('skipped existing', data.missingIngestion.missingIngestionSkippedExisting),
    diagnosticsBullet('never attempted', data.missingIngestion.missingIngestionNeverAttempted)
  )

  return lines.join('\n')
}
