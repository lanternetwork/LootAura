import { describe, expect, it } from 'vitest'
import { deriveDiscoveryFreshnessRisk } from '@/lib/admin/deriveDiscoveryFreshnessRisk'

describe('deriveDiscoveryFreshnessRisk', () => {
  it('classifies p95 against 4h SLO', () => {
    expect(deriveDiscoveryFreshnessRisk(null)).toBe('unknown')
    expect(deriveDiscoveryFreshnessRisk(3)).toBe('low')
    expect(deriveDiscoveryFreshnessRisk(4)).toBe('low')
    expect(deriveDiscoveryFreshnessRisk(6)).toBe('elevated')
    expect(deriveDiscoveryFreshnessRisk(9)).toBe('high')
  })
})
