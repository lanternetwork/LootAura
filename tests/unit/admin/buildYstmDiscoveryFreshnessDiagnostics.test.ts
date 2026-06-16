import { describe, expect, it } from 'vitest'
import { buildYstmDiscoveryFreshnessDiagnostics } from '@/lib/admin/buildYstmDiscoveryFreshnessDiagnostics'
import { minimalYstmDiscoveryFreshnessMetrics } from '@/tests/unit/admin/minimalYstmDiscoveryFreshnessMetrics'

describe('buildYstmDiscoveryFreshnessDiagnostics', () => {
  it('includes latency percentiles and capacity plan', () => {
    const md = buildYstmDiscoveryFreshnessDiagnostics(
      minimalYstmDiscoveryFreshnessMetrics({
        discoveryLatencyHours: { p50: 2, p90: 3.5, p95: 4.2, sampleCount: 120 },
        publishLatencyHours: { p50: 2.5, p90: 4, p95: 5.1, sampleCount: 100 },
        comparableListingCount: 500,
      })
    )
    expect(md).toContain('## National discovery freshness')
    expect(md).toContain('discovery p50 / p90 / p95')
    expect(md).toContain('2.0h / 3.5h / 4.2h')
    expect(md).toContain('### Capacity plan (checks/day)')
    expect(md).toContain('4h')
  })
})
