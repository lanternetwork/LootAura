import {
  diagnosticsBullet,
  formatDiagnosticsHours,
  formatDiagnosticsPct,
} from '@/lib/admin/diagnosticsMarkdown'
import type { YstmDiscoveryFreshnessMetrics } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/loadYstmDiscoveryFreshnessMetrics'

/**
 * Markdown for National discovery freshness (DISCOVERY_FRESHNESS_PROGRAM_V2).
 */
export function buildYstmDiscoveryFreshnessDiagnostics(
  data: YstmDiscoveryFreshnessMetrics
): string {
  const discovery = data.discoveryLatencyHours
  const publish = data.publishLatencyHours

  const lines: string[] = [
    '## National discovery freshness',
    diagnosticsBullet('generatedAt', data.generatedAt),
    diagnosticsBullet(
      'target',
      'discovery p95 ≤ 4h · publish p95 ≤ 4h for comparable listings'
    ),
    diagnosticsBullet(
      'discovery p50 / p90 / p95',
      `${formatDiagnosticsHours(discovery.p50)} / ${formatDiagnosticsHours(discovery.p90)} / ${formatDiagnosticsHours(discovery.p95)}`
    ),
    diagnosticsBullet('discovery sample n', discovery.sampleCount),
    diagnosticsBullet(
      'publish p50 / p90 / p95',
      `${formatDiagnosticsHours(publish.p50)} / ${formatDiagnosticsHours(publish.p90)} / ${formatDiagnosticsHours(publish.p95)}`
    ),
    diagnosticsBullet('publish sample n', publish.sampleCount),
    diagnosticsBullet('comparable listings', data.comparableListingCount),
    diagnosticsBullet('measured discovery rows', data.measuredDiscoveryCount),
    diagnosticsBullet('measured publish rows', data.measuredPublishCount),
    diagnosticsBullet('telemetry completeness', formatDiagnosticsPct(data.telemetryCompletenessPct)),
    diagnosticsBullet('proxy appearance share', formatDiagnosticsPct(data.proxyAppearancePct)),
    diagnosticsBullet(
      'velocity pools (configs)',
      `HOT ${data.velocityPoolCounts.HOT} · WARM ${data.velocityPoolCounts.WARM} · COLD ${data.velocityPoolCounts.COLD}`
    ),
    '',
    '### Config inventory',
    diagnosticsBullet('ACTIVE', data.configInventoryByClass.ACTIVE),
    diagnosticsBullet('LOW_ACTIVITY', data.configInventoryByClass.LOW_ACTIVITY),
    diagnosticsBullet('DORMANT', data.configInventoryByClass.DORMANT),
    diagnosticsBullet('DEAD', data.configInventoryByClass.DEAD),
    diagnosticsBullet('crawlable configs', data.crawlableConfigCount),
    diagnosticsBullet(
      '50% listings in top N configs',
      data.concentration.configsFor50PctListings
    ),
    diagnosticsBullet(
      '80% listings in top N configs',
      data.concentration.configsFor80PctListings
    ),
    diagnosticsBullet(
      '95% listings in top N configs',
      data.concentration.configsFor95PctListings
    ),
    diagnosticsBullet('zero-yield configs', data.concentration.zeroYieldConfigCount),
    '',
    '### Capacity plan (checks/day)',
  ]

  if (data.capacityPlan.length === 0) {
    lines.push(diagnosticsBullet('(none)', '—'))
  } else {
    for (const row of data.capacityPlan) {
      const gap =
        row.gapChecksPerDay > 0
          ? ` · gap ${row.gapChecksPerDay.toLocaleString('en-US')}`
          : ' · OK'
      lines.push(
        diagnosticsBullet(
          row.target,
          `need ${row.requiredChecksPerDay.toLocaleString('en-US')} · current ${row.currentChecksPerDay.toLocaleString('en-US')}${gap}`
        )
      )
    }
  }

  return lines.join('\n')
}
