import { diagnosticsBullet, formatDiagnosticsPct } from '@/lib/admin/diagnosticsMarkdown'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

function formatAgeMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  return `${Math.round(ms / 60000)} min`
}

function recentTimeseriesRows<T extends { bucket: string }>(
  rows: T[],
  limit: number,
  formatRow: (row: T) => string
): string[] {
  if (rows.length === 0) return [diagnosticsBullet('(none)', '—')]
  return rows.slice(-limit).map((row) => diagnosticsBullet(row.bucket, formatRow(row)))
}

/**
 * Pipeline depth, orchestration visibility, and recent timeseries from metrics API.
 */
export function buildIngestionMetricsSupplementDiagnostics(
  data: IngestionMetricsResponse
): string {
  const vol = data.volume
  const orch = data.orchestrationVisibility
  const ts = data.timeseries
  const lines: string[] = [
    '## Pipeline depth',
    diagnosticsBullet('efficiency', data.efficiency == null ? '—' : data.efficiency.toFixed(3)),
    diagnosticsBullet('geocode oldest needs_geocode age', formatAgeMs(vol.geocode.oldestNeedsGeocodeAgeMs)),
    diagnosticsBullet('publish oldest ready age', formatAgeMs(vol.publish?.oldestReadyAgeMs)),
    diagnosticsBullet('crawl overdue configs', vol.fetch.configsOverdue ?? 0),
    diagnosticsBullet('failure breakdown needs_check', data.failureBreakdown.needs_check),
    diagnosticsBullet('failure breakdown publish_failed', data.failureBreakdown.publish_failed),
    diagnosticsBullet('failure breakdown ready', data.failureBreakdown.ready),
    diagnosticsBullet('failure breakdown publishing', data.failureBreakdown.publishing),
    diagnosticsBullet('failure breakdown expired', data.failureBreakdown.expired),
    '',
    '## Orchestration visibility (48h)',
    diagnosticsBullet('lock skipped runs', orch.lockSkippedRuns48h ?? 0),
    diagnosticsBullet('budget exit runs', orch.budgetExitRuns48h ?? 0),
    diagnosticsBullet(
      'overlap prevention events',
      orch.overlapPreventionEvents48h ?? 0
    ),
    diagnosticsBullet('lane mode enabled', orch.laneModeEnabled ? 'yes' : 'no'),
  ]

  const lanes = orch.lanes ?? []
  if (lanes.length > 0) {
    lines.push('', '### Orchestration lanes')
    for (const lane of lanes) {
      lines.push(
        diagnosticsBullet(
          lane.laneKey,
          `${lane.laneType} · ${lane.stateKey} · cursor ${lane.cursor}`
        )
      )
    }
  }

  lines.push(
    '',
    '## Recent timeseries (last 6 buckets)',
    '',
    '### Published / hour',
    ...recentTimeseriesRows(ts.publishedByHour ?? [], 6, (row) => String(row.count)),
    '',
    '### Listings inserted / hour',
    ...recentTimeseriesRows(ts.listingsInsertedByHour ?? [], 6, (row) => String(row.count)),
    '',
    '### Insert yield / hour',
    ...recentTimeseriesRows(ts.insertYieldByHour ?? [], 6, (row) =>
      formatDiagnosticsPct(row.value)
    ),
    '',
    '### Saturation rate / hour',
    ...recentTimeseriesRows(ts.saturationRateByHour ?? [], 6, (row) =>
      formatDiagnosticsPct(row.value)
    ),
    '',
    '### Geocode 429 / hour',
    ...recentTimeseriesRows(ts.rate429ByHour ?? [], 6, (row) => String(row.count))
  )

  const stuckRows = data.oldestStuckRows ?? []
  if (stuckRows.length > 0) {
    lines.push('', '### Oldest stuck row samples')
    for (const row of stuckRows.slice(0, 5)) {
      lines.push(
        diagnosticsBullet(
          row.id,
          `${row.status} · ${row.city ?? '—'}, ${row.state ?? '—'} · updated ${row.updated_at}`
        )
      )
    }
  }

  return lines.join('\n')
}
