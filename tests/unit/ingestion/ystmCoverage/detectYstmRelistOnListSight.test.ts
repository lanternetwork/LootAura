import { describe, expect, it } from 'vitest'
import {
  compareYstmRelistEventFields,
  detectYstmRelistOnListSight,
} from '@/lib/ingestion/ystmCoverage/detectYstmRelistOnListSight'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

const LOUISVILLE_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/7219-KY-22/966617266/listing.html'

function baseSale(overrides: Partial<YstmListMetadataSale> = {}): YstmListMetadataSale {
  return {
    canonicalUrl: LOUISVILLE_URL,
    sourceUrl: LOUISVILLE_URL,
    title: 'Garage sale',
    description: null,
    address: '7219 KY-22, Louisville, KY',
    lat: null,
    lng: null,
    startDate: '2026-06-14',
    endDate: '2026-06-14',
    postedAt: null,
    imageUrls: [],
    ...overrides,
  }
}

describe('compareYstmRelistEventFields', () => {
  it('detects start_date and end_date changes', () => {
    const previous = baseSale({ startDate: '2026-06-14', endDate: '2026-06-14' })
    const incoming = baseSale({ startDate: '2026-06-27', endDate: '2026-06-28' })
    expect(compareYstmRelistEventFields(previous, incoming)).toEqual([
      'start_date',
      'end_date',
    ])
  })

  it('returns empty when event fields are unchanged', () => {
    const sale = baseSale()
    expect(compareYstmRelistEventFields(sale, { ...sale })).toEqual([])
  })
})

describe('detectYstmRelistOnListSight', () => {
  const detailCheckedAt = '2026-06-14T15:01:14.918Z'

  it('schedules detail refresh when expired observation has new event dates (Scenario A)', () => {
    const result = detectYstmRelistOnListSight({
      existing: {
        ystmInvalidReason: 'expired',
        lastDetailCheckedAt: detailCheckedAt,
        listMetadataSnapshot: baseSale({ startDate: '2026-06-14', endDate: '2026-06-14' }),
      },
      incoming: baseSale({ startDate: '2026-06-27', endDate: '2026-06-28' }),
    })

    expect(result.isExpiredObservation).toBe(true)
    expect(result.needsDetailRefresh).toBe(true)
    expect(result.eventFieldsChanged).toEqual(['start_date', 'end_date'])
    expect(result.preserveDetailCheckedAt).toBe(detailCheckedAt)
    expect(result.relistReason).toBe('start_date,end_date')
    expect(result.currentStartDate).toBe('2026-06-27')
    expect(result.currentEndDate).toBe('2026-06-28')
  })

  it('does not schedule refresh for non-expired observations (Scenario B)', () => {
    const result = detectYstmRelistOnListSight({
      existing: {
        ystmInvalidReason: null,
        lastDetailCheckedAt: null,
        listMetadataSnapshot: baseSale(),
      },
      incoming: baseSale({ startDate: '2026-06-27', endDate: '2026-06-28' }),
    })

    expect(result.isExpiredObservation).toBe(false)
    expect(result.needsDetailRefresh).toBe(false)
  })

  it('does not schedule refresh when expired observation metadata is unchanged (Scenario C)', () => {
    const snapshot = baseSale()
    const result = detectYstmRelistOnListSight({
      existing: {
        ystmInvalidReason: 'expired',
        lastDetailCheckedAt: detailCheckedAt,
        listMetadataSnapshot: snapshot,
      },
      incoming: { ...snapshot },
    })

    expect(result.isExpiredObservation).toBe(true)
    expect(result.needsDetailRefresh).toBe(false)
    expect(result.relistReason).toBeNull()
  })

  it('infers start_date change from relist audit columns when snapshot is missing', () => {
    const result = detectYstmRelistOnListSight({
      existing: {
        ystmInvalidReason: 'expired',
        lastDetailCheckedAt: detailCheckedAt,
        listMetadataSnapshot: null,
        relistCurrentStartDate: '2026-06-14',
        relistCurrentEndDate: '2026-06-14',
      },
      incoming: baseSale({ startDate: '2026-06-27', endDate: '2026-06-28' }),
    })

    expect(result.needsDetailRefresh).toBe(true)
    expect(result.eventFieldsChanged).toEqual(['start_date'])
  })
})
