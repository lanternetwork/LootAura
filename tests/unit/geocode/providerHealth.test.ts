import { describe, it, expect } from 'vitest'
import {
  classifyProviderHealth,
  defaultProviderHealthThresholds,
  type ProviderHealthSignals,
} from '@/lib/geocode/providerHealth'

const T = () => defaultProviderHealthThresholds()

describe('classifyProviderHealth', () => {
  it('returns healthy for nominal signals', () => {
    const signals: ProviderHealthSignals = {
      recent429Ratio: 0,
      timeoutRatio: 0,
      consecutiveFailures: 0,
      retryExhaustionRate: 0,
    }
    const d = classifyProviderHealth(signals, T())
    expect(d.status).toBe('healthy')
    expect(d.retryBackoffMs).toBe(0)
    expect(d.shouldReduceConcurrency).toBe(false)
    expect(d.shouldPauseNewClaims).toBe(false)
  })

  it('marks degraded on elevated 429 ratio', () => {
    const signals: ProviderHealthSignals = {
      recent429Ratio: 0.15,
      timeoutRatio: 0,
      consecutiveFailures: 0,
      retryExhaustionRate: 0,
    }
    const d = classifyProviderHealth(signals, T())
    expect(d.status).toBe('degraded')
    expect(d.reasons).toContain('high_429_ratio')
    expect(d.shouldReduceConcurrency).toBe(true)
  })

  it('marks unavailable on very high 429 ratio', () => {
    const signals: ProviderHealthSignals = {
      recent429Ratio: 0.4,
      timeoutRatio: 0,
      consecutiveFailures: 0,
      retryExhaustionRate: 0,
    }
    const d = classifyProviderHealth(signals, T())
    expect(d.status).toBe('unavailable')
    expect(d.shouldPauseNewClaims).toBe(true)
    expect(d.retryBackoffMs).toBeGreaterThan(0)
  })

  it('honors queue growth and poison fingerprint pressure', () => {
    const signals: ProviderHealthSignals = {
      recent429Ratio: 0,
      timeoutRatio: 0,
      consecutiveFailures: 0,
      retryExhaustionRate: 0,
      staleQueueGrowth: 20,
      maxRepeatedEmptyFingerprintCount: 5,
    }
    const d = classifyProviderHealth(signals, T())
    expect(d.reasons).toContain('queue_depth_growing')
    expect(d.reasons).toContain('poison_row_isolation_signal')
    expect(d.status).not.toBe('healthy')
  })

  it('fail-closed: invalid ratios surface as degraded+invalid_metrics', () => {
    const signals = {
      recent429Ratio: Number.NaN,
      timeoutRatio: 0,
      consecutiveFailures: 0,
      retryExhaustionRate: 0,
    } as unknown as ProviderHealthSignals
    const d = classifyProviderHealth(signals, T())
    expect(d.reasons).toContain('invalid_metrics')
    expect(d.status).not.toBe('healthy')
  })
})
