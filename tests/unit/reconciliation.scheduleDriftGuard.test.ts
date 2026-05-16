import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computeCanonicalReconciliationScheduleHash } from '@/lib/reconciliation/sourceHashing'
import {
  RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
  buildReconciledScheduleBundle,
  buildReconciliationIngestFingerprint,
} from '@/lib/reconciliation/reconciledScheduleBundle'
import {
  buildSafePublishedSaleSyncPatch,
  normalizeScheduleDateField,
  normalizeScheduleTimeField,
  resolvePhase2aScheduleSyncGate,
  saleScheduleDiffersFromCanonicalBundle,
} from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'

const resolveEndsAtMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ends_at: '2026-06-01T21:00:00.000Z',
    listing_timezone: 'America/Chicago',
  })
)

vi.mock('@/lib/sales/resolvePersistableSaleEndsAt', () => ({
  resolvePersistableSaleEndsAt: resolveEndsAtMock,
}))

vi.mock('@/lib/ingestion/externalImageValidation', () => ({
  sanitizeExternalImageUrls: async (candidates: unknown) => {
    if (!Array.isArray(candidates)) return []
    return candidates.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
  },
}))

const OAK_LAWN_INGEST = {
  date_start: '2026-06-01',
  date_end: '2026-06-01',
  time_start: '08:00:00',
  time_end: '14:00:00',
  raw_payload: {},
}

const OAK_LAWN_PARSED = {
  title: 'Oak Lawn Sale',
  description: 'Estate sale in Oak Lawn. Hours 9:00 am - 3:00 pm.',
  imageUrls: [] as const,
  dateStart: '2026-06-01',
  dateEnd: '2026-06-01',
}

function oakLawnBundle() {
  return buildReconciledScheduleBundle({
    refreshedDescription: OAK_LAWN_PARSED.description,
    parsed: OAK_LAWN_PARSED,
    ingest: OAK_LAWN_INGEST,
    sale: null,
    lat: 41.72,
    lng: -87.75,
  })
}

function oakLawnCanonicalScheduleHash() {
  const bundle = oakLawnBundle()
  expect(bundle.ok).toBe(true)
  if (!bundle.ok) throw new Error('bundle expected ok')
  return computeCanonicalReconciliationScheduleHash({
    dateStart: bundle.dateStart,
    dateEnd: bundle.dateEnd,
    timeStart: bundle.timeStart,
    timeEnd: bundle.timeEnd,
    listingTimezone: bundle.listingTimezone,
  })
}

describe('schedule drift guard helpers', () => {
  it('normalizes time fields to HH:MM:SS', () => {
    expect(normalizeScheduleTimeField('9:00')).toBe('09:00:00')
    expect(normalizeScheduleTimeField('09:00:00')).toBe('09:00:00')
    expect(normalizeScheduleTimeField(null)).toBeNull()
  })

  it('normalizes empty dates to null', () => {
    expect(normalizeScheduleDateField('')).toBeNull()
    expect(normalizeScheduleDateField('2026-06-01')).toBe('2026-06-01')
  })

  it('detects sale vs bundle drift', () => {
    const bundle = oakLawnBundle()
    expect(bundle.ok).toBe(true)
    if (!bundle.ok) return
    expect(
      saleScheduleDiffersFromCanonicalBundle(
        {
          date_start: '2026-06-01',
          date_end: '2026-06-01',
          time_start: '08:00:00',
          time_end: '14:00:00',
        },
        bundle
      )
    ).toBe(true)
    expect(
      saleScheduleDiffersFromCanonicalBundle(
        {
          date_start: '2026-06-01',
          date_end: '2026-06-01',
          time_start: '09:00:00',
          time_end: '15:00:00',
        },
        bundle
      )
    ).toBe(false)
  })
})

describe('resolvePhase2aScheduleSyncGate', () => {
  it('opens gate on bundle drift without schedule_changed class', () => {
    const bundle = oakLawnBundle()
    expect(bundle.ok).toBe(true)
    if (!bundle.ok) return
    const scheduleHash = oakLawnCanonicalScheduleHash()
    const gate = resolvePhase2aScheduleSyncGate({
      classes: ['description_changed'],
      priorFingerprint: { contentHash: 'a', scheduleHash, imageHash: 'i' },
      nextFingerprint: { contentHash: 'b', scheduleHash, imageHash: 'i' },
      sale: {
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '08:00:00',
        time_end: '14:00:00',
      },
      scheduleBundleResult: bundle,
    })
    expect(gate.scheduleDriftFromBundle).toBe(true)
    expect(gate.scheduleGate).toBe(true)
    expect(gate.scheduleBundleReason).toBeTruthy()
  })

  it('does not open gate when sale matches bundle', () => {
    const bundle = oakLawnBundle()
    expect(bundle.ok).toBe(true)
    if (!bundle.ok) return
    const scheduleHash = oakLawnCanonicalScheduleHash()
    const gate = resolvePhase2aScheduleSyncGate({
      classes: ['description_changed'],
      priorFingerprint: { contentHash: 'a', scheduleHash, imageHash: 'i' },
      nextFingerprint: { contentHash: 'b', scheduleHash, imageHash: 'i' },
      sale: {
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '09:00:00',
        time_end: '15:00:00',
      },
      scheduleBundleResult: bundle,
    })
    expect(gate.scheduleDriftFromBundle).toBe(false)
    expect(gate.scheduleGate).toBe(false)
  })

  it('does not open gate when bundle failed', () => {
    const gate = resolvePhase2aScheduleSyncGate({
      classes: ['description_changed'],
      priorFingerprint: { contentHash: 'a', scheduleHash: 'x', imageHash: 'i' },
      nextFingerprint: { contentHash: 'b', scheduleHash: 'x', imageHash: 'i' },
      sale: {
        date_start: '2026-06-01',
        date_end: '2026-06-01',
        time_start: '08:00:00',
        time_end: '14:00:00',
      },
      scheduleBundleResult: {
        ok: false,
        reasons: ['missing_coordinates'],
        schedule_bundle_reason: 'missing_coordinates',
      },
    })
    expect(gate.scheduleGate).toBe(false)
    expect(gate.scheduleDriftFromBundle).toBe(false)
  })
})

describe('buildSafePublishedSaleSyncPatch — Oak Lawn schedule drift', () => {
  beforeEach(() => {
    resolveEndsAtMock.mockReset()
    resolveEndsAtMock.mockResolvedValue({
      ends_at: '2026-06-01T21:00:00.000Z',
      listing_timezone: 'America/Chicago',
    })
  })

  const staleSale = {
    id: 's1',
    ingested_sale_id: 'i1',
    title: 'Oak Lawn Sale',
    description: 'Old body',
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
    images: [] as string[],
    moderation_status: null as string | null,
  }

  it('patches schedule when hash unchanged but sale times are stale (no schedule_changed)', async () => {
    const bundle = oakLawnBundle()
    expect(bundle.ok).toBe(true)
    if (!bundle.ok) return

    const scheduleHash = oakLawnCanonicalScheduleHash()
    const priorFp = { contentHash: 'old', scheduleHash, imageHash: 'img' }
    const nextFp = { contentHash: 'new', scheduleHash, imageHash: 'img' }

    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale: staleSale,
      snapshot: OAK_LAWN_PARSED,
      ingest: {
        normalized_address: '1 Main',
        zip_code: '60453',
        lat: 41.72,
        lng: -87.75,
        time_start: OAK_LAWN_INGEST.time_start,
        time_end: OAK_LAWN_INGEST.time_end,
        raw_payload: OAK_LAWN_INGEST.raw_payload,
        image_source_url: null,
      },
      classes: ['description_changed'],
      priorFingerprint: priorFp,
      nextFingerprint: nextFp,
      city: 'Oak Lawn',
      state: 'IL',
      rowId: 'i1',
      saleId: 's1',
      scheduleBundleResult: bundle,
    })

    expect(built.scheduleDriftFromBundle).toBe(true)
    expect(built.schedulesUpdated).toBe(true)
    expect(built.patch.time_start).toBe('09:00:00')
    expect(built.patch.time_end).toBe('15:00:00')
    expect(built.patch.ends_at).toBe('2026-06-01T21:00:00.000Z')
    expect(built.patch.description).toBe(OAK_LAWN_PARSED.description)
  })

  it('does not patch schedule columns when bundle failed', async () => {
    const scheduleHash = oakLawnCanonicalScheduleHash()
    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale: staleSale,
      snapshot: OAK_LAWN_PARSED,
      ingest: {
        normalized_address: '1 Main',
        zip_code: '60453',
        lat: 41.72,
        lng: -87.75,
        time_start: OAK_LAWN_INGEST.time_start,
        time_end: OAK_LAWN_INGEST.time_end,
        raw_payload: OAK_LAWN_INGEST.raw_payload,
        image_source_url: null,
      },
      classes: ['description_changed'],
      priorFingerprint: { contentHash: 'old', scheduleHash, imageHash: 'img' },
      nextFingerprint: { contentHash: 'new', scheduleHash, imageHash: 'img' },
      city: 'Oak Lawn',
      state: 'IL',
      rowId: 'i1',
      saleId: 's1',
      scheduleBundleResult: {
        ok: false,
        reasons: ['missing_coordinates'],
        schedule_bundle_reason: 'missing_coordinates',
      },
    })

    expect(built.patch.time_start).toBeUndefined()
    expect(built.patch.time_end).toBeUndefined()
    expect(built.schedulesUpdated).toBe(false)
    expect(built.scheduleDriftFromBundle).toBe(false)
  })

  it('does not churn schedule when sale already matches bundle', async () => {
    const bundle = oakLawnBundle()
    expect(bundle.ok).toBe(true)
    if (!bundle.ok) return

    const scheduleHash = oakLawnCanonicalScheduleHash()
    const alignedSale = {
      ...staleSale,
      time_start: '09:00:00',
      time_end: '15:00:00',
    }

    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale: alignedSale,
      snapshot: OAK_LAWN_PARSED,
      ingest: {
        normalized_address: '1 Main',
        zip_code: '60453',
        lat: 41.72,
        lng: -87.75,
        time_start: OAK_LAWN_INGEST.time_start,
        time_end: OAK_LAWN_INGEST.time_end,
        raw_payload: OAK_LAWN_INGEST.raw_payload,
        image_source_url: null,
      },
      classes: ['description_changed'],
      priorFingerprint: { contentHash: 'old', scheduleHash, imageHash: 'img' },
      nextFingerprint: { contentHash: 'new', scheduleHash, imageHash: 'img' },
      city: 'Oak Lawn',
      state: 'IL',
      rowId: 'i1',
      saleId: 's1',
      scheduleBundleResult: bundle,
    })

    expect(built.scheduleDriftFromBundle).toBe(false)
    expect(built.patch.time_start).toBeUndefined()
    expect(built.patch.time_end).toBeUndefined()
    expect(built.schedulesUpdated).toBe(false)
  })

  it('still uses hash-based schedule_changed when fingerprints diverge', async () => {
    const bundle = oakLawnBundle()
    expect(bundle.ok).toBe(true)
    if (!bundle.ok) return

    const prior = buildReconciliationIngestFingerprint({
      title: OAK_LAWN_PARSED.title,
      description: 'placeholder',
      imageUrls: [],
      ingest: OAK_LAWN_INGEST,
      parsed: null,
      sale: null,
      refreshedDescription: 'placeholder',
      priorScheduleHashForFallback: RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
      lat: 41.72,
      lng: -87.75,
    }).fingerprint

    const next = buildReconciliationIngestFingerprint({
      title: OAK_LAWN_PARSED.title,
      description: OAK_LAWN_PARSED.description,
      imageUrls: OAK_LAWN_PARSED.imageUrls,
      ingest: OAK_LAWN_INGEST,
      parsed: OAK_LAWN_PARSED,
      sale: null,
      refreshedDescription: OAK_LAWN_PARSED.description,
      priorScheduleHashForFallback: prior.scheduleHash,
      lat: 41.72,
      lng: -87.75,
    }).fingerprint

    expect(prior.scheduleHash).not.toBe(next.scheduleHash)

    const built = await buildSafePublishedSaleSyncPatch({
      admin: {} as never,
      sale: staleSale,
      snapshot: OAK_LAWN_PARSED,
      ingest: {
        normalized_address: '1 Main',
        zip_code: '60453',
        lat: 41.72,
        lng: -87.75,
        time_start: OAK_LAWN_INGEST.time_start,
        time_end: OAK_LAWN_INGEST.time_end,
        raw_payload: OAK_LAWN_INGEST.raw_payload,
        image_source_url: null,
      },
      classes: ['schedule_changed', 'description_changed'],
      priorFingerprint: prior,
      nextFingerprint: next,
      city: 'Oak Lawn',
      state: 'IL',
      rowId: 'i1',
      saleId: 's1',
      scheduleBundleResult: bundle,
    })

    expect(built.schedulesUpdated).toBe(true)
    expect(built.patch.time_start).toBe('09:00:00')
    expect(built.patch.time_end).toBe('15:00:00')
  })
})
