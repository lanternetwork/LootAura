import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { evaluateSeoIndexAllowlist } from '@/lib/seo/indexAllowlist'
import { minimalMetrics } from '../admin/ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'

const originalEnv = process.env

describe('evaluateSeoIndexAllowlist', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, SEO_PUBLIC_INDEXING_ENABLED: 'false' }
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('blocks indexing when SEO_PUBLIC_INDEXING_ENABLED is not true', () => {
    const result = evaluateSeoIndexAllowlist(minimalMetrics(), minimalYstmCoverageScoreboard())
    expect(result.indexingAllowed).toBe(false)
    expect(result.blockers.some((b) => b.includes('SEO_PUBLIC_INDEXING_ENABLED'))).toBe(true)
  })

  it('allows indexing when kill switch on and operational gates pass', () => {
    process.env.SEO_PUBLIC_INDEXING_ENABLED = 'true'
    const result = evaluateSeoIndexAllowlist(minimalMetrics(), minimalYstmCoverageScoreboard())
    expect(result.indexingAllowed).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.tier1Ready).toBe(true)
    expect(result.enforcementReady).toBe(true)
  })

  it('blocks when catalog repair queue exceeds threshold', () => {
    process.env.SEO_PUBLIC_INDEXING_ENABLED = 'true'
    const result = evaluateSeoIndexAllowlist(
      minimalMetrics(),
      minimalYstmCoverageScoreboard({
        catalogRepair: {
          ...minimalYstmCoverageScoreboard().catalogRepair,
          repairQueueTotal: 500,
        },
        pipelineBacklog: {
          ...minimalYstmCoverageScoreboard().pipelineBacklog,
          catalogRepairQueue: 500,
        },
      })
    )
    expect(result.indexingAllowed).toBe(false)
    expect(result.tier1Ready).toBe(false)
  })
})
