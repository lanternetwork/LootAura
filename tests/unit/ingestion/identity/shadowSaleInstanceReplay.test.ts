import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  compareShadowSaleInstanceDecisions,
  evaluateLegacyUrlGateDecision,
  wouldPublishFromSaleInstanceDecision,
} from '@/lib/ingestion/identity/shadowSaleInstanceReplay'

/** Listing fixtures use 2026-06-10; pin discovery time so windows stay active. */
const SHADOW_REPLAY_NOW = new Date('2026-06-09T12:00:00.000Z')

describe('shadowSaleInstanceReplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(SHADOW_REPLAY_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
  it('legacy URL gate suppresses when ingested row exists at URL', () => {
    const legacy = evaluateLegacyUrlGateDecision(
      {
        id: 'row-1',
        source_url: 'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/111/listing.html',
        status: 'ready',
        failure_reasons: [],
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        normalized_address: '500 elm st, chicago, il',
      },
      {
        dateStart: '2026-06-10',
        dateEnd: '2026-06-10',
        normalizedAddress: '500 elm st, chicago, il',
      }
    )
    expect(legacy.oldDecision).toBe('duplicate_url_skip')
    expect(legacy.oldWouldSuppress).toBe(true)
    expect(legacy.oldSkipSubReason).toBe('url_match_dates_changed')
  })

  it('flags divergence when new classifier would publish after legacy suppress', () => {
    const comparison = compareShadowSaleInstanceDecisions(
      {
        sourcePlatform: 'external_page_source',
        sourceUrl:
          'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/961002738/listing.html',
        state: 'IL',
        city: 'Chicago',
        normalizedAddress: '500 elm st, chicago, il',
        dateStart: '2026-06-10',
        dateEnd: '2026-06-10',
      },
      {
        id: 'row-2',
        source_url:
          'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/961002738/listing.html',
        status: 'expired',
        failure_reasons: ['sale_expired'],
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        normalized_address: '500 elm st, chicago, il',
        source_listing_id: '961002738',
      }
    )

    expect(comparison.oldWouldSuppress).toBe(true)
    expect(comparison.newDecision).toBe('new_event_same_url')
    expect(comparison.wouldPublish).toBe(true)
    expect(comparison.divergenceKind).toBe('old_suppress_new_publish')
  })

  it('wouldPublishFromSaleInstanceDecision is true for revive paths', () => {
    expect(wouldPublishFromSaleInstanceDecision('new_event_same_url')).toBe(true)
    expect(wouldPublishFromSaleInstanceDecision('same_event_no_change')).toBe(false)
  })
})
