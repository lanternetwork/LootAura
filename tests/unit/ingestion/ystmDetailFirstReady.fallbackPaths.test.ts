import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { YstmDetailPageParsed } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { sumDetailFirstFallbackReasonCounts } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'
import type { YstmDetailFirstRunMetrics } from '@/lib/ingestion/acquisition/ystmDetailFirstReady'

const mockFetchExternalPageSource = vi.fn()
const mockParseYstmDetailPageFromHtml = vi.fn()
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

vi.mock('@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml', () => ({
  parseYstmDetailPageFromHtml: (...args: unknown[]) => mockParseYstmDetailPageFromHtml(...args),
}))

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

/** Detail-shaped URL with too few path segments for YSTM listing parse (returns null). */
const UNPARSEABLE_DETAIL_URL = 'https://yardsaletreasuremap.com/US/IL/userlisting.html'

const CONFIG = {
  city: 'Chicago',
  state: 'IL',
  source_platform: 'external_page_source',
  source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Chicago'],
}

const VALID_LISTING = {
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

function detailParsedFromListing(
  listing: Omit<typeof VALID_LISTING, 'startDate' | 'endDate'> & {
    startDate?: string
    endDate?: string
  }
): YstmDetailPageParsed {
  return {
    title: listing.title,
    description: listing.description,
    addressRaw: listing.addressRaw,
    startDate: listing.startDate,
    endDate: listing.endDate,
    city: listing.city,
    state: listing.state,
    imageUrls: [],
    nativeCoords: null,
    cityConflict: false,
  }
}

function expectFallbackAccounting(metrics: YstmDetailFirstRunMetrics): void {
  const { publish_failed: _publishFailed, ...fallbackReasons } = metrics.rejectedByReason
  expect(sumDetailFirstFallbackReasonCounts(fallbackReasons)).toBe(metrics.fallback)
}

function mockHappyInsert() {
  mockFrom.mockImplementation(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ready-row-1' }, error: null }),
      })),
    })),
  }))
}

describe('attemptYstmDetailFirstReady fallback paths', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetchExternalPageSource.mockReset()
    mockParseYstmDetailPageFromHtml.mockReset()
    mockLookupSpatialCoordinates.mockReset()
    mockClassifySpatialFailure.mockReset()
    mockPublishReady.mockReset()
    mockUpsertCache.mockReset()
    mockFrom.mockReset()
    mockHappyInsert()
    mockClassifySpatialFailure.mockResolvedValue('spatial_lookup_failed')
    mockParseYstmDetailPageFromHtml.mockReturnValue(detailParsedFromListing(VALID_LISTING))
  })

  it('records parse_no_listing when source is not a detail URL', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: { ...VALID_LISTING, sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago' },
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'parse_no_listing' })
    expect(metrics.rejectedByReason.parse_no_listing).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records fetch_failed when detail fetch throws', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockRejectedValue(new Error('network'))
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'fetch_failed' })
    expect(metrics.fetchFailed).toBe(1)
    expect(metrics.rejectedByReason.fetch_failed).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records parse_no_listing when detail HTML does not parse', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockParseYstmDetailPageFromHtml.mockReturnValue(null)
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: { ...VALID_LISTING, sourceUrl: UNPARSEABLE_DETAIL_URL },
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'parse_no_listing' })
    expect(metrics.rejectedByReason.parse_no_listing).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records expired_after_detail for expired sale window', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockParseYstmDetailPageFromHtml.mockReturnValue(
      detailParsedFromListing({
        ...VALID_LISTING,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
      })
    )
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'expired_after_detail' })
    expect(metrics.rejectedByReason.expired_after_detail).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records missing_title when detail listing has no title', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    const noTitleSeed = { ...VALID_LISTING, title: '   ' }
    mockParseYstmDetailPageFromHtml.mockReturnValue(detailParsedFromListing(noTitleSeed))
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: noTitleSeed,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'missing_title' })
    expect(metrics.rejectedByReason.missing_title).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records invalid_dates when dates are missing', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    const noDatesSeed = { ...VALID_LISTING, startDate: undefined, endDate: undefined }
    mockParseYstmDetailPageFromHtml.mockReturnValue(detailParsedFromListing(noDatesSeed))
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: noDatesSeed,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'invalid_dates' })
    expect(metrics.rejectedByReason.invalid_dates).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records address_validation_failed when address is not geocode-ready', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockParseYstmDetailPageFromHtml.mockReturnValue(
      detailParsedFromListing({ ...VALID_LISTING, addressRaw: 'Chicago IL' })
    )
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'address_validation_failed' })
    expect(metrics.rejectedByReason.address_validation_failed).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records missing_street_number when publish validation requires street detail', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockParseYstmDetailPageFromHtml.mockReturnValue(
      detailParsedFromListing({ ...VALID_LISTING, addressRaw: 'Chicago' })
    )
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result.outcome).toBe('fallback')
    if (result.outcome === 'fallback') {
      expect(['missing_street_number', 'address_validation_failed']).toContain(result.reason)
    }
    expectFallbackAccounting(metrics)
  })

  it('records gated_address when lifecycle is address_gated', async () => {
    const addressGated = await import('@/lib/ingestion/address/addressGated')
    const lifecycle = await import('@/lib/ingestion/address/resolveIngestAddressLifecycle')
    vi.spyOn(addressGated, 'detectGatedListing').mockReturnValue({
      gated: true,
      unlockAt: new Date('2099-12-31T23:59:59Z'),
      slugWasPlaceholder: true,
    })
    vi.spyOn(lifecycle, 'resolveIngestAddressLifecycle').mockReturnValue({
      addressStatus: 'address_gated',
      canonicalSourceUrl: DETAIL_URL,
      addressUnlockAt: '2099-12-31T23:59:59.000Z',
      nextEnrichmentAttemptAt: null,
      ingestStatus: 'needs_check',
    })

    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'gated_address' })
    expect(metrics.rejectedByReason.gated_address).toBe(1)
    expectFallbackAccounting(metrics)
    vi.restoreAllMocks()
  })

  it('records spatial_lookup_failed when coordinates cannot be resolved', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockLookupSpatialCoordinates.mockResolvedValue(null)
    mockClassifySpatialFailure.mockResolvedValue('spatial_lookup_failed')
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'spatial_lookup_failed' })
    expect(metrics.rejectedByReason.spatial_lookup_failed).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records native_coords_invalid when spatial classifier says so', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockLookupSpatialCoordinates.mockResolvedValue(null)
    mockClassifySpatialFailure.mockResolvedValue('native_coords_invalid')
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'native_coords_invalid' })
    expect(metrics.rejectedByReason.native_coords_invalid).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records canonical_collision on unique constraint insert errors', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockLookupSpatialCoordinates.mockResolvedValue({
      lat: 41.81,
      lng: -87.71,
      coordinate_precision: 'provider_native',
      geocode_method: 'ystm_provider_native',
      geocode_confidence: 'high',
      resolutionSource: 'ystm_native_html',
    })
    mockFrom.mockImplementation(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'duplicate key value violates unique constraint' },
          }),
        })),
      })),
    }))
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'canonical_collision' })
    expect(metrics.rejectedByReason.canonical_collision).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('records insert_failed on non-duplicate insert errors', async () => {
    const { attemptYstmDetailFirstReady } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    mockFetchExternalPageSource.mockResolvedValue('<html></html>')
    mockLookupSpatialCoordinates.mockResolvedValue({
      lat: 41.81,
      lng: -87.71,
      coordinate_precision: 'provider_native',
      geocode_method: 'ystm_provider_native',
      geocode_confidence: 'high',
      resolutionSource: 'ystm_native_html',
    })
    mockFrom.mockImplementation(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'connection reset' },
          }),
        })),
      })),
    }))
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result).toEqual({ outcome: 'fallback', reason: 'insert_failed' })
    expect(metrics.rejectedByReason.insert_failed).toBe(1)
    expectFallbackAccounting(metrics)
  })

  it('does not count publish_failed toward fallback', async () => {
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
    mockPublishReady.mockResolvedValue({ ok: false, reason: 'publish_gate' })
    const { result, metrics } = await attemptYstmDetailFirstReady({
      config: CONFIG,
      listSeed: VALID_LISTING,
      platform: 'external_page_source',
      rowPayload: {},
      pageIndex: 0,
    })
    expect(result.outcome).toBe('ready')
    expect(metrics.fallback).toBe(0)
    expect(metrics.rejectedByReason.publish_failed).toBe(1)
    expectFallbackAccounting(metrics)
  })
})

describe('mergeYstmDetailFirstMetrics fallback accounting', () => {
  it('keeps sum(rejectedByReason) equal to fallback after merging attempts', async () => {
    const { mergeYstmDetailFirstMetrics, emptyYstmDetailFirstRunMetrics } = await import(
      '@/lib/ingestion/acquisition/ystmDetailFirstReady'
    )
    const total = emptyYstmDetailFirstRunMetrics()
    const reasons = [
      'fetch_failed',
      'spatial_lookup_failed',
      'spatial_lookup_failed',
      'gated_address',
    ] as const
    for (const reason of reasons) {
      const attempt = emptyYstmDetailFirstRunMetrics()
      attempt.attempted = 1
      attempt.fallback = 1
      attempt.rejectedByReason[reason] = 1
      mergeYstmDetailFirstMetrics(total, attempt)
    }
    expect(total.fallback).toBe(4)
    expect(sumDetailFirstFallbackReasonCounts(total.rejectedByReason)).toBe(4)
  })
})
