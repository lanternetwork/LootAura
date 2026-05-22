import { describe, expect, it } from 'vitest'
import { applyYstmGraphEnumerationThrottle } from '@/lib/ingestion/discovery/ystmGraphEnumerationThrottle'

describe('applyYstmGraphEnumerationThrottle', () => {
  it('reduces validations when fetch failure rate is high', () => {
    const result = applyYstmGraphEnumerationThrottle({
      fetchAttempts: 100,
      fetchFailures: 15,
      blockedCount: 0,
      plannedValidations: 500,
    })
    expect(result.throttled).toBe(true)
    expect(result.effectiveMaxValidations).toBe(250)
  })
})
