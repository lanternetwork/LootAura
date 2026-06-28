import { describe, expect, it } from 'vitest'
import {
  buildYstmAuditUrlListUpsert,
  buildYstmListSightObservationUpsert,
} from '@/lib/ingestion/ystmCoverage/buildYstmListSightObservationUpsert'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

const CANONICAL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/7219-KY-22/966617266/listing.html'

function baseSale(overrides: Partial<YstmListMetadataSale> = {}): YstmListMetadataSale {
  return {
    canonicalUrl: CANONICAL_URL,
    sourceUrl: CANONICAL_URL,
    title: 'Garage sale',
    description: null,
    address: '7219 KY-22, Louisville, KY',
    lat: null,
    lng: null,
    startDate: '2026-06-27',
    endDate: '2026-06-28',
    postedAt: null,
    imageUrls: [],
    ...overrides,
  }
}

const footprint = {
  sourceListingId: '966617266',
  saleInstanceKey: null,
  matchedIngestedSaleId: null,
  matchedSaleId: null,
  matchMethod: null,
  lootauraVisible: false,
}

describe('buildYstmListSightObservationUpsert', () => {
  const listSeenAt = '2026-06-17T12:00:00.000Z'
  const detailCheckedAt = '2026-06-14T15:01:14.918Z'

  it('keeps expired state and sets needsDetailRefresh when relist dates change', () => {
    const upsert = buildYstmListSightObservationUpsert({
      sale: baseSale(),
      city: 'Louisville',
      state: 'KY',
      configKey: 'KY|Louisville',
      listSeenAt,
      appearanceSource: 'fresh_discovery',
      footprint,
      existing: {
        canonicalUrl: CANONICAL_URL,
        ystmInvalidReason: 'expired',
        lastDetailCheckedAt: detailCheckedAt,
        listMetadataSnapshot: baseSale({ startDate: '2026-06-14', endDate: '2026-06-14' }),
        needsDetailRefresh: false,
        relistDetectedAt: null,
        relistReason: null,
      },
      relistDetectedAt: listSeenAt,
      hotDiscovery: true,
    })

    expect(upsert.ystmValidActive).toBe(false)
    expect(upsert.ystmInvalidReason).toBe('expired')
    expect(upsert.needsDetailRefresh).toBe(true)
    expect(upsert.detailCheckedAt).toBe(detailCheckedAt)
    expect(upsert.relistDetectedAt).toBe(listSeenAt)
    expect(upsert.relistReason).toBe('start_date,end_date')
    expect(upsert.discoveryPriority).toBe('hot')
  })

  it('leaves needsDetailRefresh false when expired metadata is unchanged', () => {
    const snapshot = baseSale({ startDate: '2026-06-14', endDate: '2026-06-14' })
    const upsert = buildYstmListSightObservationUpsert({
      sale: snapshot,
      city: 'Louisville',
      state: 'KY',
      configKey: 'KY|Louisville',
      listSeenAt,
      appearanceSource: 'fresh_discovery',
      footprint,
      existing: {
        canonicalUrl: CANONICAL_URL,
        ystmInvalidReason: 'expired',
        lastDetailCheckedAt: detailCheckedAt,
        listMetadataSnapshot: snapshot,
        needsDetailRefresh: false,
        relistDetectedAt: null,
        relistReason: null,
      },
    })

    expect(upsert.needsDetailRefresh).toBe(false)
    expect(upsert.relistDetectedAt).toBeNull()
    expect(upsert.discoveryPriority).toBe('cold')
  })

  it('preserves pending needsDetailRefresh when expired metadata is unchanged on re-sight', () => {
    const snapshot = baseSale({ startDate: '2026-06-27', endDate: '2026-06-28' })
    const priorDetectedAt = '2026-06-16T08:00:00.000Z'
    const upsert = buildYstmListSightObservationUpsert({
      sale: snapshot,
      city: 'Louisville',
      state: 'KY',
      configKey: 'KY|Louisville',
      listSeenAt,
      appearanceSource: 'fresh_discovery',
      footprint,
      existing: {
        canonicalUrl: CANONICAL_URL,
        ystmInvalidReason: 'expired',
        lastDetailCheckedAt: detailCheckedAt,
        listMetadataSnapshot: snapshot,
        needsDetailRefresh: true,
        relistDetectedAt: priorDetectedAt,
        relistReason: 'start_date,end_date',
      },
    })

    expect(upsert.needsDetailRefresh).toBe(true)
    expect(upsert.relistDetectedAt).toBe(priorDetectedAt)
    expect(upsert.relistReason).toBe('start_date,end_date')
    expect(upsert.discoveryPriority).toBe('warm')
  })

  it('uses list validity path for observations that were never expired', () => {
    const upsert = buildYstmListSightObservationUpsert({
      sale: baseSale(),
      city: 'Louisville',
      state: 'KY',
      configKey: 'KY|Louisville',
      listSeenAt,
      appearanceSource: 'fresh_discovery',
      footprint,
      existing: null,
      hotDiscovery: true,
    })

    expect(upsert.ystmValidActive).toBe(true)
    expect(upsert.needsDetailRefresh).toBe(false)
    expect(upsert.discoveryPriority).toBe('hot')
  })
})

describe('buildYstmAuditUrlListUpsert', () => {
  const listSeenAt = '2026-06-17T12:00:00.000Z'
  const detailCheckedAt = '2026-06-14T15:01:14.918Z'

  it('preserves needsDetailRefresh on url-only expired re-sight', () => {
    const upsert = buildYstmAuditUrlListUpsert({
      canonicalUrl: CANONICAL_URL,
      city: 'Louisville',
      state: 'KY',
      configKey: 'KY|Louisville',
      listSeenAt,
      footprint,
      existing: {
        canonicalUrl: CANONICAL_URL,
        ystmInvalidReason: 'expired',
        lastDetailCheckedAt: detailCheckedAt,
        listMetadataSnapshot: null,
        needsDetailRefresh: true,
        relistPreviousStartDate: '2026-06-14',
        relistPreviousEndDate: '2026-06-14',
        relistCurrentStartDate: '2026-06-27',
        relistCurrentEndDate: '2026-06-28',
        relistDetectedAt: '2026-06-16T08:00:00.000Z',
        relistReason: 'start_date,end_date',
      },
    })

    expect(upsert.needsDetailRefresh).toBe(true)
    expect(upsert.ystmInvalidReason).toBe('expired')
    expect(upsert.detailCheckedAt).toBe(detailCheckedAt)
    expect(upsert.relistDetectedAt).toBe('2026-06-16T08:00:00.000Z')
    expect(upsert.relistReason).toBe('start_date,end_date')
  })
})
