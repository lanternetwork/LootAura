import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@/lib/ingestion/identity/buildCrossProviderShadowIncoming', () => ({
  buildCrossProviderShadowIncoming: vi.fn().mockReturnValue({
    canonicalSaleInstanceKey: canonical,
    saleInstanceKey: 'estatesales_net:99',
  }),
}))

vi.mock('@/lib/ingestion/identity/fetchCrossProviderConvergenceCandidates', () => ({
  fetchCrossProviderConvergenceCandidates: vi.fn().mockResolvedValue([crossProviderRow]),
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

describe('evaluateDuplicateSkipForExternalListListing (Phase C enforce)', () => {
  const priorEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INGESTION_CROSS_PROVIDER_INGEST_ENFORCE = 'true'
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
  })

  afterEach(() => {
    process.env = { ...priorEnv }
  })

  it('returns cross-provider observation instead of hard-skipping insert', async () => {
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

    expect(out.skip).toBe(false)
    expect(out.crossProviderObservation?.duplicateOfId).toBe('ystm-prior')
    expect(out.crossProviderObservation?.isDuplicate).toBe(true)
  })
})
