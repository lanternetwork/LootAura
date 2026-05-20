import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchExternalPageSource = vi.fn()
const mockLookupSpatialCoordinates = vi.fn()
const mockClassifySpatialFailure = vi.fn()
const mockPublishReady = vi.fn()
const mockUpsertCache = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/log', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, fields }),
  emitObservabilityRecord: vi.fn(),
}))

vi.mock('@/lib/ingestion/adapters/externalPageSource', async () => {
  const mod = await vi.importActual<typeof import('@/lib/ingestion/adapters/externalPageSource')>(
    '@/lib/ingestion/adapters/externalPageSource'
  )
  return {
    ...mod,
    fetchExternalPageSource: (...args: unknown[]) => mockFetchExternalPageSource(...args),
  }
})

vi.mock('@/lib/ingestion/spatial/resolveSpatialCoordinates', () => ({
  lookupSpatialCoordinates: (...args: unknown[]) => mockLookupSpatialCoordinates(...args),
}))

vi.mock('@/lib/ingestion/acquisition/classifyDetailFirstSpatialFailure', () => ({
  classifyDetailFirstSpatialFailure: (...args: unknown[]) => mockClassifySpatialFailure(...args),
}))

vi.mock('@/lib/ingestion/publishWorker', () => ({
  publishReadyIngestedSaleById: (...args: unknown[]) => mockPublishReady(...args),
}))

vi.mock('@/lib/ingestion/spatial/addressGeocodeCache', () => ({
  upsertAddressGeocodeCache: (...args: unknown[]) => mockUpsertCache(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({ from: mockFrom }),
  fromBase: (db: { from: typeof mockFrom }, table: string) => db.from(table),
}))

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'

const CONFIG = {
  city: 'Chicago',
  state: 'IL',
  source_platform: 'external_page_source',
  source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Chicago'],
}

const LIST_SEED = {
  title: 'Garage sale',
  description: 'Lots of items',
  addressRaw: '4443 S St Louis Ave',
  city: 'Chicago',
  state: 'IL',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  sourceUrl: DETAIL_URL,
  imageSourceUrl: null,
  rawPayload: {},
}

describe('ystmDetailFirstReadyConfig', () => {
  afterEach(() => {
    delete process.env.YSTM_DETAIL_FIRST_CONCURRENCY
  })

  it('caps detail fetch concurrency', async () => {
    const { parseYstmDetailFirstConcurrencyFromEnv } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReadyConfig'
    )
    expect(parseYstmDetailFirstConcurrencyFromEnv()).toBe(3)
    process.env.YSTM_DETAIL_FIRST_CONCURRENCY = '12'
    expect(parseYstmDetailFirstConcurrencyFromEnv()).toBe(8)
  })
})

describe('detailFirstOrchestrationFields', () => {
  it('computes fresh insert ready rate and median ms', async () => {
    const { detailFirstOrchestrationFields } = await import(
      '@/lib/ingestion/acquisition/detailFirstOrchestrationFields'
    )
    const fields = detailFirstOrchestrationFields(
      {
        attempted: 4,
        succeeded: 2,
        published: 1,
        fallback: 2,
        fetchFailed: 1,
        rejectedByReason: {
          spatial_lookup_failed: 1,
          fetch_failed: 1,
        },
        msToPublishedSamples: [100, 300, 200],
        addressValidatedFromDetailPage: 3,
        addressValidatedFromListSeed: 1,
        insertFailedByDbCode: { '23514': 2 },
      },
      10
    )
    expect(fields.ystmDetailFirstInsertFailedByDbCode).toEqual({ '23514': 2 })
    expect(fields.freshInsertReadyAtInsertRate).toBe(0.2)
    expect(fields.medianMsToPublished).toBe(200)
    expect(fields.ystmDetailFirstAttempted).toBe(4)
    expect(fields.ystmDetailFirstPublished).toBe(1)
    expect(fields.ystmDetailFirstFallbackByReason).toEqual({
      spatial_lookup_failed: 1,
      fetch_failed: 1,
    })
    expect(fields.ystmDetailFirstTopFallbackReason).toBe('spatial_lookup_failed')
    expect(fields.ystmDetailFirstTopFallbackReasonPct).toBe(0.25)
    expect(fields.detailFirstAddressFromDetailPage).toBe(3)
    expect(fields.detailFirstAddressFromDetailPageRate).toBe(0.75)
  })
})

describe('parseYstmDetailListingFromHtml', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses detail-native parser over list seed for Louisville fixture', async () => {
    const { parseYstmDetailListingFromHtml } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-louisville-devondale.html'),
      'utf8'
    )
    const url =
      'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

    const merged = parseYstmDetailListingFromHtml({
      html,
      sourceUrl: url,
      config: { ...CONFIG, city: 'Louisville', state: 'KY' },
      listSeed: {
        ...LIST_SEED,
        title: 'List seed title only',
        addressRaw: 'bad seed address',
        sourceUrl: url,
        city: 'Louisville',
        state: 'KY',
      },
    })

    expect(merged?.title).toBe('Our Biggest Yard Sale')
    expect(merged?.addressRaw).toContain('1802 Devondale Dr')
    expect(merged?.startDate).toBe('2026-05-23')
    expect(merged?.rawPayload).toMatchObject({
      detailFirstReady: true,
      detailPageParsed: true,
      detailFirstFieldProvenance: {
        addressRaw: 'detail_page',
        title: 'detail_page',
        startDate: 'detail_page',
      },
      ingestionDiagnostics: {
        chosenAddressSource: 'ystm_detail_dom',
        detailFirstValidated: true,
        listSeedAddressRaw: 'bad seed address',
      },
    })
  })

  it('merges list seed with minimal native coords fixture', async () => {
    const { parseYstmDetailListingFromHtml } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-with-native-coords.html'),
      'utf8'
    )

    const merged = parseYstmDetailListingFromHtml({
      html,
      sourceUrl: DETAIL_URL,
      config: CONFIG,
      listSeed: LIST_SEED,
    })

    expect(merged?.rawPayload).toMatchObject({ detailFirstReady: true, detailPageParsed: true })
  })
})

describe('attemptYstmDetailFirstReady', () => {
  beforeEach(() => {
    mockFetchExternalPageSource.mockReset()
    mockLookupSpatialCoordinates.mockReset()
    mockClassifySpatialFailure.mockReset()
    mockPublishReady.mockReset()
    mockUpsertCache.mockReset()
    mockFrom.mockReset()
    mockClassifySpatialFailure.mockResolvedValue('spatial_lookup_failed')

    mockFrom.mockImplementation(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ready-row-1' }, error: null }),
        })),
      })),
    }))
  })

  it('falls back when detail fetch fails', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockRejectedValue(new Error('network'))

    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: LIST_SEED,
      platform: 'external_page_source',
      rowPayload: { pageIndex: 0 },
      pageIndex: 0,
    })

    expect(result).toMatchObject({ outcome: 'fallback', reason: 'fetch_failed' })
    expect(metrics.fetchFailed).toBe(1)
    expect(metrics.fallback).toBe(1)
    expect(metrics.rejectedByReason.fetch_failed).toBe(1)
  })

  it('returns detail-enriched listing on validation fallback for legacy insert', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-louisville-devondale.html'),
      'utf8'
    )
    const url =
      'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'
    mockFetchExternalPageSource.mockResolvedValue(html)
    mockLookupSpatialCoordinates.mockResolvedValue(null)

    const { result } = await attemptYstmDetailFirstReady({
      config: { ...CONFIG, city: 'Louisville', state: 'KY' },
      listSeed: {
        ...LIST_SEED,
        title: 'List seed title',
        addressRaw: 'bad seed address',
        sourceUrl: url,
        city: 'Louisville',
        state: 'KY',
      },
      platform: 'external_page_source',
      rowPayload: { pageIndex: 0 },
      pageIndex: 0,
    })

    expect(result.outcome).toBe('fallback')
    if (result.outcome === 'fallback') {
      expect(result.reason).toBe('spatial_lookup_failed')
      expect(result.detailEnrichedListing?.addressRaw).toContain('1802 Devondale Dr')
      expect(result.detailPageHtml).toBe(html)
      expect(result.detailEnrichedListing?.rawPayload).toMatchObject({
        detailPageParsed: true,
        ingestionDiagnostics: { chosenAddressSource: 'ystm_detail_dom' },
      })
    }
  })

  it('inserts ready and publishes when detail validation passes', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-with-native-coords.html'),
      'utf8'
    )
    mockFetchExternalPageSource.mockResolvedValue(html)
    mockLookupSpatialCoordinates.mockResolvedValue({
      lat: 41.81225221,
      lng: -87.71115022,
      coordinate_precision: 'provider_native',
      geocode_method: 'ystm_provider_native',
      geocode_confidence: 'high',
      resolutionSource: 'ystm_native_html',
    })
    mockPublishReady.mockResolvedValue({ ok: true, publishedSaleId: 'sale-1' })

    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: LIST_SEED,
      platform: 'external_page_source',
      rowPayload: { pageIndex: 0 },
      pageIndex: 0,
    })

    expect(result.outcome).toBe('ready')
    if (result.outcome === 'ready') {
      expect(result.ingestedSaleId).toBe('ready-row-1')
      expect(result.published).toBe(true)
    }
    expect(metrics.succeeded).toBe(1)
    expect(metrics.published).toBe(1)
    expect(mockUpsertCache).toHaveBeenCalled()
    expect(mockPublishReady).toHaveBeenCalledWith('ready-row-1')
  })

  it('inserts ready for Hidden address with native coords (native-first)', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-logan-square-hidden.html'),
      'utf8'
    )
    const url =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/Logan-Square-Moving-Sale/2441465/userlisting.html'
    mockFetchExternalPageSource.mockResolvedValue(html)
    mockLookupSpatialCoordinates.mockResolvedValue({
      lat: 41.92775,
      lng: -87.70562,
      coordinate_precision: 'provider_native',
      geocode_method: 'ystm_provider_native',
      geocode_confidence: 'high',
      resolutionSource: 'ystm_provider_native',
    })
    mockPublishReady.mockResolvedValue({ ok: false, error: 'Missing address line' })

    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: {
        ...LIST_SEED,
        title: 'List seed title',
        addressRaw: 'Logan Square Moving Sale',
        sourceUrl: url,
        startDate: '2026-05-21',
        endDate: '2026-05-24',
      },
      platform: 'external_page_source',
      rowPayload: { pageIndex: 0 },
      pageIndex: 0,
    })

    expect(result.outcome).toBe('ready')
    expect(metrics.succeeded).toBe(1)
    expect(mockUpsertCache).not.toHaveBeenCalled()
    if (result.outcome === 'ready') {
      expect(result.published).toBe(false)
    }
  })
})

describe('mapWithBoundedConcurrency', () => {
  it('runs all items with bounded parallelism', async () => {
    const { mapWithBoundedConcurrency } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const order: number[] = []
    await mapWithBoundedConcurrency([0, 1, 2, 3], 2, async (item) => {
      order.push(item)
    })
    expect(order.sort()).toEqual([0, 1, 2, 3])
  })
})
