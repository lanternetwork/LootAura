import { describe, it, expect } from 'vitest'
import { evaluateSeoIndexAllowlist } from '@/lib/seo/indexAllowlist'
import { SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutState'
import { minimalMetrics } from '../admin/ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'
import { enabledSeoRolloutState } from './seoRolloutTestHelpers'

describe('evaluateSeoIndexAllowlist', () => {
  it('blocks indexing when admin public indexing is not enabled', () => {
    const result = evaluateSeoIndexAllowlist(
      minimalMetrics(),
      minimalYstmCoverageScoreboard(),
      SEO_ROLLOUT_DISABLED_STATE
    )
    expect(result.indexingAllowed).toBe(false)
    expect(result.blockers.some((b) => b.includes('SEO public indexing'))).toBe(true)
  })

  it('allows indexing when admin opt-in on and operational gates pass', () => {
    const result = evaluateSeoIndexAllowlist(
      minimalMetrics(),
      minimalYstmCoverageScoreboard(),
      enabledSeoRolloutState()
    )
    expect(result.indexingAllowed).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.tier1Ready).toBe(true)
    expect(result.enforcementReady).toBe(true)
  })

  it('blocks when catalog repair queue exceeds threshold', () => {
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
      }),
      enabledSeoRolloutState()
    )
    expect(result.indexingAllowed).toBe(false)
    expect(result.tier1Ready).toBe(false)
  })
})
