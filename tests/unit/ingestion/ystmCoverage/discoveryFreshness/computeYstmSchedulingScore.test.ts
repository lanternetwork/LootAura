import { describe, expect, it } from 'vitest'
import { computeYstmSchedulingScore } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/computeYstmSchedulingScore'

describe('computeYstmSchedulingScore', () => {
  it('boosts stale hot configs above stale cold configs', () => {
    const hot = computeYstmSchedulingScore({ stalenessHours: 10, velocityPool: 'HOT' })
    const cold = computeYstmSchedulingScore({ stalenessHours: 10, velocityPool: 'COLD' })
    expect(hot).toBeGreaterThan(cold)
  })
})
