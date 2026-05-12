import { describe, expect, it } from 'vitest'
import {
  isIngestionOrchestrationLeaseActiveAt,
  isStaleOrchestrationLeaseAt,
  parseIngestionOrchestrationLeaseSeconds,
} from '@/lib/operationalResilience/ingestionOrchestrationLeaseGate'

describe('ingestionOrchestrationLeaseGate', () => {
  it('parses lease seconds with defaults and bounds', () => {
    expect(parseIngestionOrchestrationLeaseSeconds(undefined)).toBe(120)
    expect(parseIngestionOrchestrationLeaseSeconds('')).toBe(120)
    expect(parseIngestionOrchestrationLeaseSeconds('29')).toBe(120)
    expect(parseIngestionOrchestrationLeaseSeconds('45')).toBe(45)
    expect(parseIngestionOrchestrationLeaseSeconds('9999')).toBe(600)
  })

  it('detects active lease when owner present and expiry in the future', () => {
    const now = 1_700_000_000_000
    const future = new Date(now + 60_000).toISOString()
    expect(isIngestionOrchestrationLeaseActiveAt(now, 'owner-a', future)).toBe(true)
    expect(isIngestionOrchestrationLeaseActiveAt(now, 'owner-a', new Date(now - 1).toISOString())).toBe(false)
    expect(isIngestionOrchestrationLeaseActiveAt(now, null, future)).toBe(false)
  })

  it('detects stale lease when owner present and expiry at or before now', () => {
    const now = 1_700_000_000_000
    expect(isStaleOrchestrationLeaseAt(now, 'owner-a', new Date(now).toISOString())).toBe(true)
    expect(isStaleOrchestrationLeaseAt(now, 'owner-a', new Date(now - 1).toISOString())).toBe(true)
    expect(isStaleOrchestrationLeaseAt(now, null, new Date(now).toISOString())).toBe(false)
  })
})
