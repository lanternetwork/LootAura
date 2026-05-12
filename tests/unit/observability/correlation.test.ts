import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as nodeCrypto from 'crypto'
import { createCorrelationBundle, mergeCorrelation } from '@/lib/observability/correlation'

vi.mock('@/lib/log', () => ({
  generateOperationId: vi.fn(() => 'op-from-log'),
}))

describe('correlation helpers', () => {
  beforeEach(() => {
    vi.spyOn(nodeCrypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099' as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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
    expect(b.correlationId).toBe('00000000-0000-4000-8000-000000000099')
    expect(b.operationId).toBe('op-from-log')
    expect(b.requestId).toBe('op-from-log')
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
