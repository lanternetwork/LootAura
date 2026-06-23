import { describe, expect, it } from 'vitest'
import { isScheduleWaitFalseExclusion } from '@/lib/ingestion/ystmCoverage/resolveScheduleWaitFalseExclusion'

const UNLOCK_URL =
  'https://yardsaletreasuremap.com/US/Texas/Austin/See-source-for-address-after-2026-06-06-14%3A00%3A00/1/listing.html'

function gatedIngested(overrides: Record<string, unknown> = {}) {
  return {
    address_status: 'address_gated',
    source_url: UNLOCK_URL,
    address_enrichment_attempts: 1,
    next_enrichment_attempt_at: null,
    address_unlock_at: '2026-06-06T13:00:00.000Z',
    last_address_enrichment_attempt_at: null,
    ...overrides,
  }
}

describe('isScheduleWaitFalseExclusion', () => {
  const nowMs = Date.parse('2026-06-06T12:00:00.000Z')

  it('returns true for unlock_scheduled with future unlock', () => {
    expect(
      isScheduleWaitFalseExclusion({
        ingested: gatedIngested(),
        sourceUrl: UNLOCK_URL,
        nowMs,
      })
    ).toBe(true)
  })

  it('returns false when unlock has elapsed', () => {
    expect(
      isScheduleWaitFalseExclusion({
        ingested: gatedIngested({ address_unlock_at: '2026-06-06T10:00:00.000Z' }),
        sourceUrl: UNLOCK_URL,
        nowMs: Date.parse('2026-06-06T15:00:00.000Z'),
      })
    ).toBe(false)
  })

  it('returns false when cooldown is active', () => {
    expect(
      isScheduleWaitFalseExclusion({
        ingested: gatedIngested({
          address_unlock_at: '2026-06-06T10:00:00.000Z',
          last_address_enrichment_attempt_at: '2026-06-06T14:50:00.000Z',
        }),
        sourceUrl: UNLOCK_URL,
        nowMs: Date.parse('2026-06-06T15:00:00.000Z'),
      })
    ).toBe(false)
  })

  it('returns false when address is not gated', () => {
    expect(
      isScheduleWaitFalseExclusion({
        ingested: gatedIngested({ address_status: 'address_available' }),
        sourceUrl: UNLOCK_URL,
        nowMs,
      })
    ).toBe(false)
  })
})
