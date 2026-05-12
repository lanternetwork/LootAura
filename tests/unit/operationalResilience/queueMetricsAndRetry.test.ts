import { describe, expect, it } from 'vitest'
import {
  classifyQueuePressure,
  classifyRetryExhaustion,
  computeRedisStarvationTelemetrySignal,
} from '@/lib/observability/metrics'

describe('operational resilience queue + retry classification', () => {
  it('classifies queue pressure tiers deterministically', () => {
    expect(classifyQueuePressure(0, 10)).toBe('normal')
    expect(classifyQueuePressure(5, 10)).toBe('elevated')
    expect(classifyQueuePressure(10, 10)).toBe('high')
    expect(classifyQueuePressure(20, 10)).toBe('critical')
  })

  it('classifies geocode DB retry ceiling (3 attempts) exhaustion', () => {
    expect(classifyRetryExhaustion(0, 3)).toBe('none')
    expect(classifyRetryExhaustion(2, 3)).toBe('approaching')
    expect(classifyRetryExhaustion(3, 3)).toBe('exhausted')
  })

  it('classifies Redis job visibility exhaustion used by geocode queue batch telemetry', () => {
    expect(classifyRetryExhaustion(11, 12)).toBe('approaching')
    expect(classifyRetryExhaustion(12, 12)).toBe('exhausted')
  })

  it('computes redis starvation / idle-coalesced signal like geocodeQueue', () => {
    expect(
      computeRedisStarvationTelemetrySignal({
        dequeued: 0,
        queueDepthBeforeTotal: 0,
        queueDepthAfterTotal: 0,
      })
    ).toBe(true)
    expect(
      computeRedisStarvationTelemetrySignal({
        dequeued: 0,
        queueDepthBeforeTotal: 1,
        queueDepthAfterTotal: 0,
      })
    ).toBe(false)
    expect(
      computeRedisStarvationTelemetrySignal({
        dequeued: 1,
        queueDepthBeforeTotal: 0,
        queueDepthAfterTotal: 0,
      })
    ).toBe(false)
  })
})
