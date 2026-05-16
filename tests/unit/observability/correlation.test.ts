import { describe, it, expect, vi } from 'vitest'
import { createCorrelationBundle, mergeCorrelation } from '@/lib/observability/correlation'

vi.mock('@/lib/log', () => ({
  generateOperationId: vi.fn(() => 'op-from-log'),
}))

describe('correlation helpers', () => {
  it('createCorrelationBundle preserves explicit fields', () => {
    const b = createCorrelationBundle({
      requestId: 'req-1',
      operationId: 'op-99',
      correlationId: 'corr-1',
      jobType: 'test.job',
    })
    expect(b.requestId).toBe('req-1')
    expect(b.operationId).toBe('op-99')
    expect(b.correlationId).toBe('corr-1')
    expect(b.jobType).toBe('test.job')
  })

  it('createCorrelationBundle generates correlationId and uses log operation id', () => {
    const b = createCorrelationBundle({})
    expect(b.operationId).toBe('op-from-log')
    expect(b.requestId).toBe('op-from-log')
    // correlation.ts binds `randomUUID` at import time; do not spy on `crypto` here (often non-configurable / ineffective).
    expect(b.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('mergeCorrelation adds only defined correlation keys', () => {
    const merged = mergeCorrelation(
      { a: 1 },
      {
        requestId: 'r',
        operationId: 'o',
        correlationId: 'c',
        workerId: undefined,
        jobType: 'jt',
      }
    )
    expect(merged).toEqual({
      a: 1,
      requestId: 'r',
      operationId: 'o',
      correlationId: 'c',
      jobType: 'jt',
    })
  })
})
