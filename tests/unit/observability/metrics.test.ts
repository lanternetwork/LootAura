import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  classifyQueuePressure,
  classifyRetryExhaustion,
  createDurationTimer,
  staleAgeMsFromIso,
} from '@/lib/observability/metrics'

describe('observability metrics helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('classifyRetryExhaustion', () => {
    expect(classifyRetryExhaustion(0, 3)).toBe('none')
    expect(classifyRetryExhaustion(2, 3)).toBe('approaching')
    expect(classifyRetryExhaustion(3, 3)).toBe('exhausted')
    expect(classifyRetryExhaustion(1, 0)).toBe('unknown')
  })

  it('classifyQueuePressure', () => {
    expect(classifyQueuePressure(0, 10)).toBe('normal')
    expect(classifyQueuePressure(5, 10)).toBe('elevated')
    expect(classifyQueuePressure(10, 10)).toBe('high')
    expect(classifyQueuePressure(20, 10)).toBe('critical')
    expect(classifyQueuePressure(NaN, 10)).toBe('unknown')
  })

  it('staleAgeMsFromIso uses current time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
    expect(staleAgeMsFromIso('2025-06-01T11:59:30.000Z')).toBe(30_000)
    expect(staleAgeMsFromIso(null)).toBeNull()
    expect(staleAgeMsFromIso('not-a-date')).toBeNull()
  })

  it('createDurationTimer uses fixed clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
    const t = createDurationTimer(Date.now())
    vi.setSystemTime(new Date('2025-06-01T12:00:02.500Z'))
    expect(t.elapsedMs()).toBe(2500)
  })
})
