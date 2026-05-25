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

function chainForSoftDup(rows: unknown[]) {
  return {
    select: () => ({
      eq: () => ({
        not: () => ({
          gte: () => ({
            lte: () => ({
              order: () => ({
                limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
              }),
            }),
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
})
