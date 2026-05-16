import { describe, expect, it, vi } from 'vitest'
import { computeCanonicalReconciliationScheduleHash } from '@/lib/reconciliation/sourceHashing'
import {
  RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
  buildReconciledScheduleBundle,
  buildReconciliationIngestFingerprint,
} from '@/lib/reconciliation/reconciledScheduleBundle'
import { buildSafePublishedSaleSyncPatch } from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'

vi.mock('@/lib/ingestion/externalImageValidation', () => ({
  sanitizeExternalImageUrls: async (candidates: unknown) => {
    if (!Array.isArray(candidates)) return []
    return candidates.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
  },
}))

const resolveEndsAtMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ends_at: '2026-06-01T21:00:00.000Z',
    listing_timezone: 'America/Chicago',
  })
)

vi.mock('@/lib/sales/resolvePersistableSaleEndsAt', () => ({
  resolvePersistableSaleEndsAt: resolveEndsAtMock,
}))

describe('reconciledScheduleBundle', () => {
  it('prefers prose 9–3 over stale non-null ingest 8–2 (Oak Lawn regression)', () => {
    const b = buildReconciledScheduleBundle({
      refreshedDescription: 'Estate sale in Oak Lawn. Hours 9:00 am - 3:00 pm.',
      parsed: {
        title: 'Oak Lawn Sale',
        description: 'Estate sale in Oak Lawn. Hours 9:00 am - 3:00 pm.',
        imageUrls: [],
        dateStart: '2026-06-01',
        dateEnd: '2026-06-01',
      },
      ingest: {
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '08:00:00',
        time_end: '14:00:00',
        raw_payload: {},
      },
      sale: null,
      lat: 41.72,
      lng: -87.75,
    })
    expect(b.ok).toBe(true)
    if (b.ok) {
      expect(b.timeStart).toBe('09:00:00')
      expect(b.timeEnd).toBe('15:00:00')
      expect(b.provenance).toBe('mixed_safe')
    }
  })

  it('parses compact 9am - 3pm prose window', () => {
    const b = buildReconciledScheduleBundle({
      refreshedDescription: 'front door at 8am. Sale hours 9am - 3pm.',
      parsed: null,
      ingest: {
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '08:00:00',
        time_end: '14:00:00',
        raw_payload: {},
      },
      sale: null,
      lat: 41.72,
      lng: -87.75,
    })
    expect(b.ok).toBe(true)
    if (b.ok) {
      expect(b.timeStart).toBe('09:00:00')
      expect(b.timeEnd).toBe('15:00:00')
      expect(b.provenance).toBe('prose_window')
    }
  })

  it('uses ingest when refreshed prose has no time window', () => {
    const b = buildReconciledScheduleBundle({
      refreshedDescription: 'No hours here, just items.',
      parsed: {
        title: 'Sale',
        description: 'No hours here, just items.',
        imageUrls: [],
        dateStart: '2026-06-01',
        dateEnd: '2026-06-01',
      },
      ingest: {
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '10:00:00',
        time_end: '16:00:00',
        raw_payload: {},
      },
      sale: null,
      lat: 40,
      lng: -74,
    })
    expect(b.ok).toBe(true)
    if (b.ok) {
      expect(b.timeStart).toBe('10:00:00')
      expect(b.timeEnd).toBe('16:00:00')
      expect(b.provenance).toBe('existing_ingest')
    }
  })

  it('fails closed on invalid dates', () => {
    const b = buildReconciledScheduleBundle({
      refreshedDescription: 'Hours 9:00 AM to 3:00 PM',
      parsed: {
        title: 'Bad',
        description: 'Hours 9:00 AM to 3:00 PM',
        imageUrls: [],
        dateStart: 'not-a-date',
        dateEnd: 'not-a-date',
      },
      ingest: {
        date_start: 'not-a-date',
        date_end: 'not-a-date',
        time_start: '08:00:00',
        time_end: '14:00:00',
        raw_payload: {},
      },
      sale: null,
      lat: 41,
      lng: -87,
    })
    expect(b.ok).toBe(false)
    if (!b.ok) {
      expect(b.schedule_bundle_reason).toBe('invalid_schedule_dates')
    }
  })

  it('fails closed when coordinates are missing', () => {
    const b = buildReconciledScheduleBundle({
      refreshedDescription: 'Hours 9:00 AM to 3:00 PM',
      parsed: {
        title: 'Sale',
        description: 'Hours 9:00 AM to 3:00 PM',
        imageUrls: [],
        dateStart: '2026-06-01',
        dateEnd: '2026-06-01',
      },
      ingest: {
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: null,
        time_end: null,
        raw_payload: {},
      },
      sale: null,
      lat: null,
      lng: null,
    })
    expect(b.ok).toBe(false)
    if (!b.ok) {
      expect(b.schedule_bundle_reason).toBe('missing_coordinates')
    }
  })

  it('hash aligns with bundle when prose drives schedule', () => {
    const ingest = {
      date_start: '2026-06-01',
      date_end: '2026-06-01',
      time_start: '08:00:00',
      time_end: '14:00:00',
      raw_payload: {},
    }
    const parsed = {
      title: 'Sale',
      description: 'Hours 9:00 AM to 3:00 PM',
      imageUrls: [] as const,
      dateStart: '2026-06-01',
      dateEnd: '2026-06-01',
    }
    const { fingerprint, bundle } = buildReconciliationIngestFingerprint({
      title: parsed.title,
      description: parsed.description,
      imageUrls: parsed.imageUrls,
      ingest,
      parsed,
      sale: null,
      refreshedDescription: parsed.description,
      priorScheduleHashForFallback: RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
      lat: 41.72,
      lng: -87.75,
    })
    expect(bundle.ok).toBe(true)
    if (bundle.ok) {
      const expected = computeCanonicalReconciliationScheduleHash({
        dateStart: bundle.dateStart,
        dateEnd: bundle.dateEnd,
        timeStart: bundle.timeStart,
        timeEnd: bundle.timeEnd,
        listingTimezone: bundle.listingTimezone,
      })
      expect(fingerprint.scheduleHash).toBe(expected)
    }
  })
})

describe('buildSafePublishedSaleSyncPatch schedule atomicity', () => {
  beforeEach(() => {
    resolveEndsAtMock.mockReset()
    resolveEndsAtMock.mockResolvedValue({
      ends_at: '2026-06-01T21:00:00.000Z',
      listing_timezone: 'America/Chicago',
    })
  })

  it('skips all schedule columns when ends_at cannot be resolved', async () => {
    resolveEndsAtMock.mockResolvedValueOnce({ ends_at: null, listing_timezone: 'America/Chicago' })

    const ingestSlice = {
      date_start: '2026-06-01',
      date_end: '2026-06-01',
      time_start: '08:00:00',
      time_end: '14:00:00',
      raw_payload: {},
    }
    const parsed = {
      title: 'Oak Lawn',
      description: 'Hours 9:00 AM to 3:00 PM',
      imageUrls: [] as const,
      dateStart: '2026-06-01',
      dateEnd: '2026-06-01',
    }
    const prior = buildReconciliationIngestFingerprint({
      title: parsed.title,
      description: 'placeholder',
      imageUrls: [],
      ingest: ingestSlice,
      parsed: null,
      sale: null,
      refreshedDescription: 'placeholder',
      priorScheduleHashForFallback: RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
      lat: 41.72,
      lng: -87.75,
    }).fingerprint
    const next = buildReconciliationIngestFingerprint({
      title: parsed.title,
      description: parsed.description,
      imageUrls: parsed.imageUrls,
      ingest: ingestSlice,
      parsed,
      sale: null,
      refreshedDescription: parsed.description,
      priorScheduleHashForFallback: prior.scheduleHash,
      lat: 41.72,
      lng: -87.75,
    }).fingerprint
    const bundle = buildReconciledScheduleBundle({
      refreshedDescription: parsed.description,
      parsed,
      ingest: ingestSlice,
      sale: null,
      lat: 41.72,
      lng: -87.75,
    })
    expect(bundle.ok).toBe(true)

    const sale = {
      id: 's1',
      ingested_sale_id: 'i1',
      title: 'Oak Lawn',
      description: 'placeholder',
      address: '1 Main St',
      city: 'Oak Lawn',
      state: 'IL',
      zip_code: '60453',
      lat: 41.72,
      lng: -87.75,
      date_start: '2026-06-01',
      date_end: '2026-06-01',
      time_start: '08:00:00',
      time_end: '14:00:00',
      ends_at: '2026-06-01T19:00:00.000Z',
      listing_timezone: 'America/Chicago',
      cover_image_url: null,
      images: [],
      moderation_status: null as string | null,
    }

    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale,
      snapshot: parsed,
      ingest: {
        normalized_address: '1 Main',
        zip_code: '60453',
        lat: 41.72,
        lng: -87.75,
        time_start: ingestSlice.time_start,
        time_end: ingestSlice.time_end,
        raw_payload: ingestSlice.raw_payload,
        image_source_url: null,
      },
      classes: ['schedule_changed'],
      priorFingerprint: prior,
      nextFingerprint: next,
      city: 'Oak Lawn',
      state: 'IL',
      rowId: 'i1',
      saleId: 's1',
      scheduleBundleResult: bundle,
    })

    expect(built.patch.date_start).toBeUndefined()
    expect(built.patch.time_start).toBeUndefined()
    expect(built.patch.time_end).toBeUndefined()
    expect(built.patch.ends_at).toBeUndefined()
    expect(built.schedulesUpdated).toBe(false)
    expect(built.scheduleMutationInhibited).toBe(true)
    expect(built.scheduleMutationInhibitedReason).toBe('ends_at_unresolved')
  })
})
