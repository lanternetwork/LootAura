import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function chainAfterLte(rows: unknown[]) {
  return {
    is: () => ({
      order: () => ({
        limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  }
}

function chainForSoftDup(rows: unknown[]) {
  return {
    select: () => ({
      eq: () => ({
        not: () => ({
          gte: () => ({
            lte: () => chainAfterLte(rows),
          }),
        }),
      }),
      or: () => ({
        not: () => ({
          gte: () => ({
            lte: () => chainAfterLte(rows),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

describe('evaluateDuplicateSkipForExternalListListing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips insert when scored duplicate against existing row', async () => {
    mockFromBase.mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sale_soft_dedupe_suppressions') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return chainForSoftDup([
        {
          id: 'prior-1',
          date_start: '2026-12-01',
          date_end: null,
          title: 'Holiday sale tools',
          source_platform: 'external_page_source',
          external_id: '77',
          lat: null,
          lng: null,
          image_source_url: null,
        },
      ])
    })

    const { evaluateDuplicateSkipForExternalListListing } = await import('@/lib/ingestion/dedupe')
    const out = await evaluateDuplicateSkipForExternalListListing({} as never, 'external_page_source', {
      title: 'Holiday sale tools',
      city: 'Chicago',
      state: 'IL',
      addressRaw: '50 Oak St, Chicago, IL',
      startDate: '2026-12-02',
      endDate: null,
      externalId: '77',
      imageSourceUrl: null,
      sourceUrl: 'https://example.com/US/Illinois/Chicago/50-Oak-St/9999/listing.html',
    })

    expect(out.skip).toBe(true)
    expect(out.duplicateOfId).toBe('prior-1')
    expect(out.crossProviderObservation).toBeNull()
  })

  it('does not skip when Phase 8 safety blocks weak suppress', async () => {
    mockFromBase.mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sale_soft_dedupe_suppressions') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return chainForSoftDup([
        {
          id: 'prior-2',
          date_start: '2026-12-01',
          date_end: null,
          title: 'Holiday sale tools',
          source_platform: 'external_page_source',
          external_id: '88',
          lat: null,
          lng: null,
          image_source_url: null,
          status: 'expired',
          failure_reasons: ['sale_window_ended'],
        },
      ])
    })

    const { evaluateDuplicateSkipForExternalListListing } = await import('@/lib/ingestion/dedupe')
    const out = await evaluateDuplicateSkipForExternalListListing({} as never, 'external_page_source', {
      title: 'Holiday sale tools',
      city: 'Chicago',
      state: 'IL',
      addressRaw: '50 Oak St, Chicago, IL',
      startDate: '2026-12-02',
      endDate: null,
      externalId: '88',
      imageSourceUrl: null,
      sourceUrl: 'https://www.yardsaletreasuremap.com/US/Illinois/Chicago/50-Oak-St/9999/listing.html',
      lat: 41.8781,
      lng: -87.6298,
    })

    expect(out.skip).toBe(false)
    expect(out.duplicateOfId).toBeNull()
    expect(out.crossProviderObservation).toBeNull()
  })

  it('inserts cross-provider observation instead of skipping when Phase C enforce is on', async () => {
    const prior = process.env.INGESTION_CROSS_PROVIDER_INGEST_ENFORCE
    process.env.INGESTION_CROSS_PROVIDER_INGEST_ENFORCE = 'true'
    const canonical = 'c'.repeat(64)

    const crossProviderRow = {
      id: 'ystm-prior',
      date_start: '2026-12-01',
      date_end: '2026-12-01',
      title: 'Holiday sale tools',
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

    vi.doMock('@/lib/ingestion/identity/buildCrossProviderShadowIncoming', () => ({
      buildCrossProviderShadowIncoming: vi.fn().mockReturnValue({
        canonicalSaleInstanceKey: canonical,
        saleInstanceKey: 'estatesales_net:99',
      }),
    }))
    vi.doMock('@/lib/ingestion/identity/fetchCrossProviderConvergenceCandidates', () => ({
      fetchCrossProviderConvergenceCandidates: vi.fn().mockResolvedValue([crossProviderRow]),
    }))

    mockFromBase.mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sale_soft_dedupe_suppressions') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      if (table === 'cross_provider_sale_instance_shadow') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return chainForSoftDup([])
    })

    vi.resetModules()
    const { evaluateDuplicateSkipForExternalListListing } = await import('@/lib/ingestion/dedupe')
    const out = await evaluateDuplicateSkipForExternalListListing({} as never, 'estatesales_net', {
      title: 'Holiday sale tools',
      city: 'Chicago',
      state: 'IL',
      addressRaw: '50 Oak St, Chicago, IL',
      startDate: '2026-12-02',
      endDate: null,
      externalId: '99',
      imageSourceUrl: null,
      sourceUrl: 'https://www.estatesales.net/US/Illinois/Chicago/50-Oak-St/9999',
      lat: 41.8781,
      lng: -87.6298,
    })

    process.env.INGESTION_CROSS_PROVIDER_INGEST_ENFORCE = prior
    vi.doUnmock('@/lib/ingestion/identity/buildCrossProviderShadowIncoming')
    vi.doUnmock('@/lib/ingestion/identity/fetchCrossProviderConvergenceCandidates')

    expect(out.skip).toBe(false)
    expect(out.crossProviderObservation?.duplicateOfId).toBe('ystm-prior')
    expect(out.crossProviderObservation?.isDuplicate).toBe(true)
  })
})
