import { beforeEach, describe, expect, it, vi } from 'vitest'
import { minimalValidProbeFetchResponse } from '../../helpers/minimalProbeImage'

const { dnsLookup, createPublishedSaleMock, mockFromBase } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  createPublishedSaleMock: vi.fn(),
  mockFromBase: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: (...args: unknown[]) => createPublishedSaleMock(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const INGESTED_ID = '33333333-3333-4333-8333-333333333333'

function baseRow() {
  return {
    id: INGESTED_ID,
    source_platform: 'external_page_source',
    source_url: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/1-Main-St/99/userlisting.html',
    title: 'Garage sale',
    description: null,
    normalized_address: '1 Main St',
    city: 'Chicago',
    state: 'IL',
    zip_code: null,
    lat: 41.8,
    lng: -87.6,
    date_start: '2026-05-06',
    date_end: null,
    time_start: '09:00:00',
    time_end: null,
    image_cloudinary_url: null,
    image_source_url: null,
    raw_payload: { adapter: 'external_page_source' },
    published_sale_id: null,
    failure_reasons: [],
    coordinate_precision: 'rooftop',
  }
}

function makeClaimBuilder(row: unknown) {
  const builder: Record<string, unknown> = {}
  const self = new Proxy(builder, {
    get(_target, prop: string) {
      if (prop === 'maybeSingle') {
        return async () => ({ data: row, error: null })
      }
      if (prop === 'eq' || prop === 'is' || prop === 'not' || prop === 'select' || prop === 'update') {
        return () => self
      }
      return undefined
    },
  })
  return self
}

function mockIngestedSalesClaimSequence(row: unknown) {
  mockFromBase.mockImplementation((_db: unknown, table: string) => {
    if (table === 'ingested_sales') {
      const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
      if (n === 1) {
        return makeClaimBuilder(row)
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    }
    return {
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }
  })
}

describe('publishReadyIngestedSaleById without images (D2.5 cron path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-no-images' })
    vi.stubGlobal('fetch', vi.fn(async () => minimalValidProbeFetchResponse()))
    mockIngestedSalesClaimSequence(baseRow())
  })

  it('publishes when image_source_url and raw_payload.imageUrls are absent', async () => {
    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(INGESTED_ID)

    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls ?? []).toEqual([])
  })
})
