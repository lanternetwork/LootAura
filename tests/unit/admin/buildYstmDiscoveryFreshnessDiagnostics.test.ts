import { describe, expect, it } from 'vitest'
import { buildYstmDiscoveryFreshnessDiagnostics } from '@/lib/admin/buildYstmDiscoveryFreshnessDiagnostics'
import { minimalYstmDiscoveryFreshnessMetrics } from '@/tests/unit/admin/minimalYstmDiscoveryFreshnessMetrics'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function coverageWithTelemetry(
  telemetryCompletenessPct: number | null
): YstmCoverageMetricsResponse {
  return {
    ok: true,
    discoveryFreshness: minimalYstmDiscoveryFreshnessMetrics({
      telemetryCompletenessPct,
      discoveryLatencyHours: { p50: 1, p90: 2, p95: 3, sampleCount: 10 },
      publishLatencyHours: { p50: 2, p90: 3, p95: 4, sampleCount: 8 },
      velocityPoolCounts: { HOT: 1, WARM: 2, COLD: 3 },
    }),
  } as unknown as YstmCoverageMetricsResponse
}

describe('buildYstmDiscoveryFreshnessDiagnostics', () => {
  it('formats telemetry completeness on 0-100 scale without double scaling', () => {
    const full = buildYstmDiscoveryFreshnessDiagnostics(coverageWithTelemetry(100))
    const partial = buildYstmDiscoveryFreshnessDiagnostics(coverageWithTelemetry(92))

    expect(full).toContain('- telemetry_completeness: 100.0%')
    expect(partial).toContain('- telemetry_completeness: 92.0%')
  })

  it('renders em dash when telemetry completeness is unavailable', () => {
    const md = buildYstmDiscoveryFreshnessDiagnostics(coverageWithTelemetry(null))
    expect(md).toContain('- telemetry_completeness: —')
  })
})
