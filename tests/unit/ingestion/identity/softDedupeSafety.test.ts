import { describe, expect, it } from 'vitest'
import {
  evaluateSoftDedupeSuppressionSafety,
  type SoftDedupeSafetyCandidate,
  type SoftDedupeSafetyIncoming,
} from '@/lib/ingestion/identity/softDedupeSafety'

function incoming(p: Partial<SoftDedupeSafetyIncoming>): SoftDedupeSafetyIncoming {
  return {
    dateStart: '2026-06-10',
    dateEnd: '2026-06-10',
    sourceUrl: 'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/961002738/listing.html',
    externalId: null,
    state: 'IL',
    city: 'Chicago',
    normalizedAddress: '500 elm st, chicago, il',
    lat: 41.88,
    lng: -87.63,
    ...p,
  }
}

function winner(p: Partial<SoftDedupeSafetyCandidate>): SoftDedupeSafetyCandidate {
  return {
    id: 'row-a',
    date_start: '2026-06-10',
    date_end: '2026-06-10',
    title: 'Tools',
    source_platform: 'external_page_source',
    external_id: null,
    lat: 41.88,
    lng: -87.63,
    image_source_url: null,
    ...p,
  }
}

describe('evaluateSoftDedupeSuppressionSafety', () => {
  it('allows suppress when dates and listing id align', () => {
    const out = evaluateSoftDedupeSuppressionSafety(
      incoming({}),
      winner({
        source_url:
          'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/961002738/listing.html',
        source_listing_id: '961002738',
      })
    )
    expect(out.allowSuppress).toBe(true)
    expect(out.blockedReasons).toEqual([])
  })

  it('blocks when start dates are more than 3 days apart', () => {
    const out = evaluateSoftDedupeSuppressionSafety(
      incoming({ dateStart: '2026-06-20' }),
      winner({ date_start: '2026-06-10' })
    )
    expect(out.allowSuppress).toBe(false)
    expect(out.blockedReasons).toContain('date_start_beyond_3_day_tolerance')
  })

  it('blocks when YSTM listing ids differ', () => {
    const out = evaluateSoftDedupeSuppressionSafety(
      incoming({
        sourceUrl:
          'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/111/listing.html',
      }),
      winner({
        source_url:
          'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/222/listing.html',
        source_listing_id: '222',
      })
    )
    expect(out.allowSuppress).toBe(false)
    expect(out.blockedReasons).toContain('source_listing_id_materially_different')
  })

  it('blocks when incoming has native coords and winner row is expired', () => {
    const out = evaluateSoftDedupeSuppressionSafety(
      incoming({ lat: 41.9, lng: -87.6 }),
      winner({ status: 'expired', failure_reasons: ['sale_window_ended'] })
    )
    expect(out.allowSuppress).toBe(false)
    expect(out.blockedReasons).toContain('expired_winner_valid_incoming_coords')
  })

  it('blocks when sale_instance_key values differ', () => {
    const out = evaluateSoftDedupeSuppressionSafety(
      incoming({ saleInstanceKey: 'a:key:one' }),
      winner({ sale_instance_key: 'a:key:two' })
    )
    expect(out.allowSuppress).toBe(false)
    expect(out.blockedReasons).toContain('sale_instance_key_mismatch')
  })

  it('allows cross-provider suppress when canonical keys match despite sale_instance_key mismatch', () => {
    const canonical = 'd'.repeat(64)
    const out = evaluateSoftDedupeSuppressionSafety(
      incoming({
        sourcePlatform: 'estatesales_net',
        saleInstanceKey: 'estatesales_net:4913946',
        canonicalSaleInstanceKey: canonical,
      }),
      winner({
        source_platform: 'external_page_source',
        sale_instance_key: 'external_page_source:ystm:77',
        canonical_sale_instance_key: canonical,
      })
    )
    expect(out.blockedReasons).not.toContain('sale_instance_key_mismatch')
  })
})
