import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFromBase } = vi.hoisted(() => ({
  mockFromBase: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const INGESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const claimedRow = {
  id: INGESTED_ID,
  source_platform: 'ystm',
  source_url: 'https://example.com/listing',
  title: 'Sale',
  description: null,
  normalized_address: '1 Main',
  city: 'Albany',
  state: 'NY',
  zip_code: null,
  lat: 42.6,
  lng: -73.7,
  date_start: '2026-05-01',
  date_end: '2026-05-10',
  time_start: null,
  time_end: null,
  image_cloudinary_url: null,
  image_source_url: null,
  raw_payload: {},
  published_sale_id: null,
  failure_reasons: [],
  coordinate_precision: 'locality',
}

describe('publishReadyIngestedSaleById coordinate precision gate', () => {
  let needsCheckPayload: Record<string, unknown> | null = null
  let ingestedSalesUpdateCount = 0

  beforeEach(() => {
    needsCheckPayload = null
    ingestedSalesUpdateCount = 0
    mockFromBase.mockReset()
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table !== 'ingested_sales') {
        return { update: () => ({ eq: async () => ({ error: null }) }) }
      }
      return {
        update: (payload: Record<string, unknown>) => {
          ingestedSalesUpdateCount += 1
          if (ingestedSalesUpdateCount === 1) {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              not: () => chain,
              select: () => ({
                maybeSingle: async () => ({
                  data: claimedRow,
                  error: null,
                }),
              }),
            }
            return chain
          }
          return {
            eq: () => ({
              eq: async () => {
                needsCheckPayload = payload
                return { error: null }
              },
            }),
          }
        },
      }
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('skips publish when coordinate_precision is locality', async () => {
    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(INGESTED_ID)

    expect(result).toEqual({ ok: true, skipped: true, reason: 'non_publishable_precision' })
    expect(needsCheckPayload?.status).toBe('needs_check')
  })
})
