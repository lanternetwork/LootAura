import { diagnosticBullet, formatDiagnosticPct } from '@/lib/admin/diagnosticsMarkdown'
import { deriveDiscoveryFreshnessRisk } from '@/lib/admin/deriveDiscoveryFreshnessRisk'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}h`
}

function formatVelocityPool(counts: { HOT: number; WARM: number; COLD: number }): string {
  return `HOT ${counts.HOT} · WARM ${counts.WARM} · COLD ${counts.COLD}`
}

export function buildYstmDiscoveryFreshnessDiagnostics(
  coverage: YstmCoverageMetricsResponse
): string | null {
  const freshness = coverage.discoveryFreshness
  if (!freshness) return null

  const discovery = freshness.discoveryLatencyHours
  const publish = freshness.publishLatencyHours
  const risk = deriveDiscoveryFreshnessRisk(discovery.p95)

  const lines = [
    '## DISCOVERY FRESHNESS',
    diagnosticBullet('latency_p50', formatHours(discovery.p50)),
    diagnosticBullet('latency_p90', formatHours(discovery.p90)),
    diagnosticBullet('publish_latency_p50', formatHours(publish.p50)),
    diagnosticBullet('publish_latency_p90', formatHours(publish.p90)),
    diagnosticBullet('sample_count', discovery.sampleCount),
    diagnosticBullet('telemetry_completeness', formatDiagnosticPct(freshness.telemetryCompletenessPct)),
    diagnosticBullet('velocity_pool', formatVelocityPool(freshness.velocityPoolCounts)),
    diagnosticBullet('freshness_risk', risk),
  ]

  return lines.join('\n')
}
