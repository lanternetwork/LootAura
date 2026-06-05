import { describe, expect, it } from 'vitest'
import { evaluateYstmIngestionRepairProgram } from '@/lib/admin/evaluateYstmIngestionRepairProgram'
import { minimalMetrics } from './ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from './evaluateYstmSaleInstanceRolloutGates.test'
import {
  FALSE_EXCLUSION_TRACE_BUCKETS,
  type FalseExclusionTraceBucket,
} from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'

function emptyFalseExclusionBuckets(): Record<FalseExclusionTraceBucket, number> {
  return Object.fromEntries(
    FALSE_EXCLUSION_TRACE_BUCKETS.map((bucket) => [bucket, 0])
  ) as Record<FalseExclusionTraceBucket, number>
}

describe('evaluateYstmIngestionRepairProgram', () => {
  it('returns seven workstreams A–G', () => {
    const program = evaluateYstmIngestionRepairProgram(
      minimalMetrics(),
      minimalYstmCoverageScoreboard()
    )
    expect(program.workstreams.map((w) => w.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })

  it('blocks workstream A when duplicate canonical clusters exist', () => {
    const program = evaluateYstmIngestionRepairProgram(
      minimalMetrics(),
      minimalYstmCoverageScoreboard({
        crossProviderConvergence: {
          ...minimalYstmCoverageScoreboard().crossProviderConvergence,
          duplicatePublishedCanonicalClusters: 2,
        },
      })
    )
    const wsA = program.workstreams.find((w) => w.id === 'A')
    expect(wsA?.status).toBe('blocked')
    expect(wsA?.acceptanceMet).toBe(false)
  })

  it('marks tier1 not ready when coverage below 90%', () => {
    const program = evaluateYstmIngestionRepairProgram(
      minimalMetrics(),
      minimalYstmCoverageScoreboard({ coveragePct: 85.5, missingValidYstmUrls: 492 })
    )
    expect(program.tier1Ready).toBe(false)
    expect(program.seoUnblockTier1Ready).toBe(false)
    const wsC = program.workstreams.find((w) => w.id === 'C')
    expect(wsC?.status).toBe('watch')
  })

  it('sorts false-exclusion buckets by count descending', () => {
    const buckets = emptyFalseExclusionBuckets()
    buckets.detail_first_fallback = 230
    buckets.repair_pending = 113
    buckets.published_not_visible = 98

    const program = evaluateYstmIngestionRepairProgram(
      minimalMetrics(),
      minimalYstmCoverageScoreboard({
        missingValidYstmUrls: 441,
        falseExclusionAudit: {
          generatedAt: new Date().toISOString(),
          missingValidCount: 441,
          tracedCount: 441,
          byPrimaryBucket: buckets,
          traces: [],
        },
      })
    )

    expect(program.falseExclusionBuckets[0]?.bucket).toBe('detail_first_fallback')
    expect(program.falseExclusionBuckets[0]?.count).toBe(230)
    expect(program.falseExclusionBuckets[1]?.bucket).toBe('repair_pending')
  })

  it('includes needs_check context in workstream B metric', () => {
    const program = evaluateYstmIngestionRepairProgram(
      minimalMetrics({
        failureBreakdown: {
          needs_check: 369,
          publish_failed: 4,
          expired: 0,
          ready: 0,
          publishing: 0,
        },
        volume: {
          ...minimalMetrics().volume,
          addressLifecycle: {
            byStatus: {},
            enrichmentBacklog: 451,
          },
        },
      }),
      minimalYstmCoverageScoreboard({
        catalogRepair: {
          ...minimalYstmCoverageScoreboard().catalogRepair,
          repairQueueTotal: 372,
        },
        pipelineBacklog: {
          ...minimalYstmCoverageScoreboard().pipelineBacklog,
          catalogRepairQueue: 372,
        },
      })
    )
    const wsB = program.workstreams.find((w) => w.id === 'B')
    expect(wsB?.metric).toContain('372')
    expect(wsB?.metric).toContain('369')
    expect(wsB?.metric).toContain('451')
    expect(wsB?.acceptanceMet).toBe(false)
  })
})
