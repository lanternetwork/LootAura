import { describe, expect, it } from 'vitest'
import { evaluateNeedsCheckRootCauseDiscovery } from '@/lib/admin/evaluateNeedsCheckRootCauseDiscovery'
import { minimalMetrics } from './ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from './evaluateYstmSaleInstanceRolloutGates.test'
import type { NeedsCheckRootCauseAnalysis } from '@/lib/admin/needsCheckRootCauseTypes'

function sampleAnalysis(overrides: Partial<NeedsCheckRootCauseAnalysis> = {}): NeedsCheckRootCauseAnalysis {
  return {
    total: 100,
    scanned: 100,
    byBlockerCategory: {
      address_enrichment_dependent: 0,
      address_gated: 70,
      precision_gated: 20,
      geocode_blocked: 5,
      publish_eligible_today: 3,
      other: 2,
    },
    byAgeBucket: {
      under_7d: 10,
      '7_to_30d': 40,
      over_30d: 50,
    },
    byPublishability: {
      blocked_by_enrichment: 70,
      blocked_by_precision: 20,
      blocked_by_geocode: 5,
      publishable_today: 3,
      blocked_by_other: 2,
    },
    failureSignals: {
      'failure_reason:geocode_failed': 5,
    },
    allPairs: [
      {
        addressStatus: 'address_gated',
        coordinatePrecision: 'locality',
        count: 60,
        pct: 0.6,
      },
    ],
    ...overrides,
  }
}

describe('evaluateNeedsCheckRootCauseDiscovery', () => {
  it('identifies dominant category and owner with repair queue percentages', () => {
    const discovery = evaluateNeedsCheckRootCauseDiscovery(
      sampleAnalysis(),
      minimalMetrics({
        failureBreakdown: {
          needs_check: 100,
          publish_failed: 0,
          expired: 0,
          ready: 0,
          publishing: 0,
        },
      }),
      minimalYstmCoverageScoreboard({
        catalogRepair: {
          ...minimalYstmCoverageScoreboard().catalogRepair,
          repairQueueTotal: 120,
          needsCheck: 100,
        },
      }),
      '2026-06-05T12:00:00.000Z'
    )

    expect(discovery.dominantCategory).toBe('address_gated')
    expect(discovery.dominantOwner).toBe('address_enrichment')
    expect(discovery.needsCheckPctOfRepairQueue).toBeCloseTo(100 / 120)
    expect(discovery.explainingCategoriesPct).toBeGreaterThanOrEqual(0.8)
    expect(discovery.discoveryComplete).toBe(true)
    expect(discovery.repairScopeRecommendation).toContain('Address gated')
  })

  it('marks discovery incomplete when total is zero', () => {
    const discovery = evaluateNeedsCheckRootCauseDiscovery(
      sampleAnalysis({ total: 0, scanned: 0 }),
      minimalMetrics(),
      null,
      '2026-06-05T12:00:00.000Z'
    )
    expect(discovery.discoveryComplete).toBe(false)
    expect(discovery.dominantCategory).toBeNull()
  })
})
