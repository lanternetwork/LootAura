import { describe, expect, it } from 'vitest'
import {
  evaluateSeoEnablementGate,
  evaluateSeoEnablementMetricGate,
  SEO_ENABLEMENT_COVERAGE_MIN_PCT,
  SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX,
  SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN,
} from '@/lib/seo/evaluateSeoEnablementGate'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'
import { enabledSeoRolloutState, healthyEnablementCoverage } from './seoRolloutTestHelpers'

describe('evaluateSeoEnablementGate', () => {
  it('metric gate passes with healthy enablement coverage', () => {
    const metric = evaluateSeoEnablementMetricGate(healthyEnablementCoverage())
    expect(metric.metricGatePass).toBe(true)
    expect(metric.blockers).toEqual([])
  })

  it('metric gate fails when coverage is below threshold', () => {
    const metric = evaluateSeoEnablementMetricGate(
      healthyEnablementCoverage({ coveragePct: SEO_ENABLEMENT_COVERAGE_MIN_PCT - 1 })
    )
    expect(metric.metricGatePass).toBe(false)
    expect(metric.blockers.some((b) => b.includes('Coverage'))).toBe(true)
  })

  it('metric gate fails when effective missing valid exceeds cap', () => {
    const base = healthyEnablementCoverage()
    const metric = evaluateSeoEnablementMetricGate(
      healthyEnablementCoverage({
        actionableMissingValid: {
          ...base.actionableMissingValid!,
          effectiveMissingValidYstmUrls: SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX + 1,
        },
      })
    )
    expect(metric.metricGatePass).toBe(false)
  })

  it('metric gate fails when published active inventory is too low', () => {
    const metric = evaluateSeoEnablementMetricGate(
      healthyEnablementCoverage({
        publishedActiveLootAuraYstmUrls: SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN - 1,
      })
    )
    expect(metric.metricGatePass).toBe(false)
  })

  it('seo emission requires metric gate and all attestations', () => {
    const coverage = healthyEnablementCoverage()
    const blocked = evaluateSeoEnablementGate(coverage, enabledSeoRolloutState({ publicIndexingEnabled: false }))
    expect(blocked.seoEmissionAllowed).toBe(false)
    expect(blocked.readyForIndexing).toBe(false)

    const ready = evaluateSeoEnablementGate(coverage, enabledSeoRolloutState())
    expect(ready.seoEmissionAllowed).toBe(true)
    expect(ready.readyForIndexing).toBe(true)
    expect(ready.blockers).toEqual([])
  })

  it('does not require stabilization allowlist criteria', () => {
    const coverage = minimalYstmCoverageScoreboard({
      catalogRepair: {
        repairQueueTotal: 500,
        needsGeocode: 0,
        readyUnpublished: 0,
        publishFailed: 0,
        needsCheck: 0,
        repairedPublishedLast24h: 0,
        repairFailed: 0,
      },
      pipelineBacklog: {
        missingValidUrls: 10,
        missingIngestionQueue: 10,
        missingIngestionNeverAttempted: 3,
        catalogRepairQueue: 500,
        existingRefreshStale: 0,
      },
      coveragePct: 98.5,
      publishedActiveLootAuraYstmUrls: 2500,
      crossProviderConvergence: {
        ...minimalYstmCoverageScoreboard().crossProviderConvergence,
        duplicatePublishedCanonicalClusters: 0,
      },
      actionableMissingValid: {
        ...minimalYstmCoverageScoreboard().actionableMissingValid!,
        effectiveMissingValidYstmUrls: 20,
      },
    })
    const enablement = evaluateSeoEnablementGate(coverage, enabledSeoRolloutState())
    expect(enablement.metricGatePass).toBe(true)
    expect(enablement.seoEmissionAllowed).toBe(true)
  })
})
