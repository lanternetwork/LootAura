import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const canonical = 'd'.repeat(64)

const esnetPrimaryRow = {
  id: 'esnet-prior',
  date_start: '2026-12-01',
  date_end: '2026-12-01',
  title: 'Estate sale tools',
  source_platform: 'estatesales_net',
  external_id: '99',
  lat: 41.8781,
  lng: -87.6298,
  image_source_url: null,
  canonical_sale_instance_key: canonical,
  published_sale_id: null,
  is_duplicate: false,
  normalized_address: '50 oak st, chicago, il',
}

const ystmPrimaryRow = {
  id: 'ystm-prior',
  date_start: '2026-12-01',
  date_end: '2026-12-01',
  title: 'Yard sale tools',
  source_platform: 'external_page_source',
  external_id: '77',
  lat: 41.8781,
  lng: -87.6298,
  image_source_url: null,
  canonical_sale_instance_key: canonical,
  published_sale_id: null,
  is_duplicate: false,
  normalized_address: '50 oak st, chicago, il',
}

const fetchCrossProviderConvergenceCandidatesMock = vi.fn()

vi.mock('@/lib/ingestion/identity/buildCrossProviderShadowIncoming', () => ({
  buildCrossProviderShadowIncoming: vi.fn(
    (platform: string, _probe: unknown, _address: string) => ({
      canonicalSaleInstanceKey: canonical,
      saleInstanceKey: platform === 'estatesales_net' ? 'estatesales_net:99' : 'external_page_source:77',
    })
  ),
}))

vi.mock('@/lib/ingestion/identity/fetchCrossProviderConvergenceCandidates', () => ({
  fetchCrossProviderConvergenceCandidates: (...args: unknown[]) =>
    fetchCrossProviderConvergenceCandidatesMock(...args),
}))

const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (_e: string, f: Record<string, unknown>) => ({ event: _e, ...f }),
  emitObservabilityRecord: vi.fn(),
}))

function mockShadowTables() {
  mockFromBase.mockImplementation((_admin: unknown, table: string) => {
    if (table === 'cross_provider_sale_instance_shadow') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }
    return {
      select: () => ({
        eq: () => ({
          not: () => ({
            gte: () => ({
              lte: () => ({
                is: () => ({
                  order: () => ({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

describe('cross-provider ingest ordering (integration spec)', () => {
  const priorEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INGESTION_CROSS_PROVIDER_ENFORCEMENT = 'true'
    mockShadowTables()
  })

  afterEach(() => {
    process.env = { ...priorEnv }
    vi.resetModules()
  })

  it('ES.net second (YSTM primary): retains observation instead of hard skip', async () => {
    fetchCrossProviderConvergenceCandidatesMock.mockResolvedValue([ystmPrimaryRow])

    const { evaluateDuplicateSkipForExternalListListing } = await import('@/lib/ingestion/dedupe')
    const out = await evaluateDuplicateSkipForExternalListListing({} as never, 'estatesales_net', {
      title: 'Estate sale tools',
      city: 'Chicago',
      state: 'IL',
      addressRaw: '50 Oak St, Chicago, IL',
      startDate: '2026-12-02',
      endDate: null,
      externalId: '99',
      imageSourceUrl: null,
      sourceUrl: 'https://www.estatesales.net/IL/Chicago/50-Oak-St/9999',
      lat: 41.8781,
      lng: -87.6298,
    })

    expect(out.skip).toBe(false)
    expect(out.crossProviderObservation?.duplicateOfId).toBe('ystm-prior')
    expect(out.crossProviderObservation?.isDuplicate).toBe(true)
  })

  it('YSTM second (ES.net primary): retains observation instead of hard skip', async () => {
    fetchCrossProviderConvergenceCandidatesMock.mockResolvedValue([esnetPrimaryRow])

    const { evaluateDuplicateSkipForExternalListListing } = await import('@/lib/ingestion/dedupe')
    const out = await evaluateDuplicateSkipForExternalListListing({} as never, 'external_page_source', {
      title: 'Yard sale tools',
      city: 'Chicago',
      state: 'IL',
      addressRaw: '50 Oak St, Chicago, IL',
      startDate: '2026-12-02',
      endDate: null,
      externalId: '77',
      imageSourceUrl: null,
      sourceUrl: 'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/50-Oak-St/9999/listing.html',
      lat: 41.8781,
      lng: -87.6298,
    })

    expect(out.skip).toBe(false)
    expect(out.crossProviderObservation?.duplicateOfId).toBe('esnet-prior')
    expect(out.crossProviderObservation?.isDuplicate).toBe(true)
  })
})
