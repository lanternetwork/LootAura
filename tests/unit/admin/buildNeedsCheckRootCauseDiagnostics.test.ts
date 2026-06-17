import { describe, expect, it } from 'vitest'
import { buildNeedsCheckRootCauseDiagnostics } from '@/lib/admin/buildNeedsCheckRootCauseDiagnostics'
import { evaluateNeedsCheckRootCauseDiscovery } from '@/lib/admin/evaluateNeedsCheckRootCauseDiscovery'
import { minimalMetrics } from './ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from './evaluateYstmSaleInstanceRolloutGates.test'
import type { NeedsCheckRootCauseAnalysis } from '@/lib/admin/needsCheckRootCauseTypes'

describe('buildNeedsCheckRootCauseDiagnostics', () => {
  it('includes workstream sections in markdown', () => {
    const analysis: NeedsCheckRootCauseAnalysis = {
      total: 10,
      scanned: 10,
      byBlockerCategory: {
        address_enrichment_retryable: 0,
        address_enrichment_terminal: 0,
        address_gated: 8,
        precision_gated: 2,
        geocode_blocked: 0,
        publish_eligible_today: 0,
        other: 0,
      },
      byAgeBucket: { under_7d: 3, '7_to_30d': 4, over_30d: 3 },
      byPublishability: { blocked_by_enrichment: 8, blocked_by_precision: 2 },
      failureSignals: {},
      allPairs: [
        {
          addressStatus: 'address_gated',
          coordinatePrecision: 'locality',
          count: 8,
          pct: 0.8,
        },
      ],
    }

    const metrics = minimalMetrics({
      failureBreakdown: {
        needs_check: 10,
        publish_failed: 0,
        expired: 0,
        ready: 0,
        publishing: 0,
      },
      needsCheckBreakdown: {
        total: 10,
        scanned: 10,
        byAddressStatus: { address_gated: 8, address_available: 2 },
        byCoordinatePrecision: { locality: 8, exact_address: 2 },
        topPairs: [
          {
            addressStatus: 'address_gated',
            coordinatePrecision: 'locality',
            count: 8,
          },
        ],
      },
    })

    const discovery = evaluateNeedsCheckRootCauseDiscovery(
      analysis,
      metrics,
      minimalYstmCoverageScoreboard(),
      metrics.generatedAt
    )

    const md = buildNeedsCheckRootCauseDiagnostics(discovery, metrics.needsCheckBreakdown)
    expect(md).toContain('NEEDS_CHECK_ROOT_CAUSE_DISCOVERY')
    expect(md).toContain('Workstream A — Dashboard metrics')
    expect(md).toContain('Workstream B — Blocker classification')
    expect(md).toContain('Workstream C — Root cause ownership')
    expect(md).toContain('Workstream D — Repair scope recommendation')
    expect(md).toContain('address_gated')
  })
})
