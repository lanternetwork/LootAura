import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

function chainForCrossProvider(rows: unknown[]) {
  return {
    select: () => ({
      or: () => ({
        not: () => ({
          gte: () => ({
            lte: () => ({
              is: () => ({
                order: () => ({
                  limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
      eq: () => ({
        not: () => ({
          gte: () => ({
            lte: () => ({
              is: () => ({
                order: () => ({
                  limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }
}

describe('evaluateCrossProviderObservationForIngest', () => {
  const priorEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.INGESTION_CROSS_PROVIDER_INGEST_ENFORCE = 'true'
  })

  afterEach(() => {
    process.env = { ...priorEnv }
  })

  it('returns observation linkage for cross-platform canonical match', async () => {
    const canonical = 'b'.repeat(64)
    mockFromBase.mockImplementation(() =>
      chainForCrossProvider([
        {
          id: 'ystm-1',
          source_platform: 'external_page_source',
          source_url: 'https://ystm.example/listing',
          canonical_sale_instance_key: canonical,
          published_sale_id: 'pub-1',
          is_duplicate: false,
          date_start: '2026-05-30',
          date_end: '2026-05-30',
          normalized_address: '1200 bardstown rd',
          title: 'Smith estate sale',
          lat: 38.235,
          lng: -85.72,
        },
      ])
    )

    const { evaluateCrossProviderObservationForIngest } = await import(
      '@/lib/ingestion/identity/evaluateCrossProviderObservationForIngest'
    )
    const out = await evaluateCrossProviderObservationForIngest(
      'estatesales_net',
      {
        sourceUrl: 'https://www.estatesales.net/KY/Louisville/40222/4913946',
        state: 'KY',
        city: 'Louisville',
        title: 'Smith estate sale',
        startDate: '2026-05-30',
        endDate: '2026-05-30',
        externalId: '4913946',
        imageSourceUrl: null,
        lat: 38.235,
        lng: -85.72,
      },
      '1200 bardstown rd'
    )

    expect(out?.isDuplicate).toBe(true)
    expect(out?.duplicateOfId).toBe('ystm-1')
    expect(out?.disposition).toBe('would_link_observation')
  })
})
