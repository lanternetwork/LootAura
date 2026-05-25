import { describe, expect, it } from 'vitest'
import { computeEsnetRefreshPolicy } from '@/lib/ingestion/estatesalesnet/esnetAdaptiveRefreshPolicy'

describe('computeEsnetRefreshPolicy', () => {
  const now = Date.parse('2026-05-24T12:00:00.000Z')

  it('uses daily cadence when sale is more than 7 days out', () => {
    const policy = computeEsnetRefreshPolicy({
      dateStart: '2026-06-10',
      dateEnd: '2026-06-12',
      nowMs: now,
    })
    expect(policy.tier).toBe('dormant')
    expect(policy.minIntervalMs).toBe(24 * 60 * 60 * 1000)
  })

  it('elevates cadence inside 48h of start', () => {
    const policy = computeEsnetRefreshPolicy({
      dateStart: '2026-05-25T12:00:00.000Z',
      dateEnd: '2026-05-26T12:00:00.000Z',
      nowMs: now,
    })
    expect(policy.tier).toBe('imminent')
    expect(policy.minIntervalMs).toBe(4 * 60 * 60 * 1000)
  })

  it('stops refresh after sale window ends', () => {
    const policy = computeEsnetRefreshPolicy({
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      nowMs: now,
    })
    expect(policy.tier).toBe('expired')
    expect(policy.minIntervalMs).toBeNull()
  })
})
