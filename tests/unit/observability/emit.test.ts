import { describe, it, expect } from 'vitest'
import { buildTelemetryRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

describe('buildTelemetryRecord', () => {
  it('keeps event and drops undefined optional fields', () => {
    const r = buildTelemetryRecord(ObservabilityEvents.api.cronDailyHit, {
      phase: 'response',
      mode: 'daily',
      skipMe: undefined,
      count: 0,
    })
    expect(r.event).toBe(ObservabilityEvents.api.cronDailyHit)
    expect(r.phase).toBe('response')
    expect('skipMe' in r).toBe(false)
  })
})
