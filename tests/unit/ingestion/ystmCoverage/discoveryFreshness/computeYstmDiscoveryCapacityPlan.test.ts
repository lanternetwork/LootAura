import { describe, expect, it } from 'vitest'
import { buildYstmDiscoveryCapacityPlan } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/computeYstmDiscoveryCapacityPlan'

describe('buildYstmDiscoveryCapacityPlan', () => {
  it('computes required checks per day for active configs', () => {
    const plan = buildYstmDiscoveryCapacityPlan({
      activeConfigCount: 480,
      auditRunsPerDay: 4,
      maxConfigsPerRun: 80,
      bootstrapEnabled: true,
    })

    const row24h = plan.find((row) => row.target === '24h')
    expect(row24h?.requiredChecksPerDay).toBe(480)
    expect(row24h?.currentChecksPerDay).toBe(320)
    expect(row24h?.gapChecksPerDay).toBe(160)
    expect(row24h?.feasibleWithCurrentBudget).toBe(false)

    const row4h = plan.find((row) => row.target === '4h')
    expect(row4h?.requiredChecksPerDay).toBe(2880)
  })
})
