import { beforeEach, describe, expect, it, vi } from 'vitest'

const createPublishedSaleMock = vi.fn()

const mockFromBase = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: (...args: unknown[]) => createPublishedSaleMock(...args),
}))

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

describe('publish worker image consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-1' })

    let call = 0
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      call += 1
      if (table === 'ingested_sales' && call === 1) {
        return makeClaimBuilder({
          id: '33333333-3333-4333-8333-333333333333',
          source_platform: 'external_page_source',
          source_url: 'https://example.com/listing/1',
          title: 'Sale',
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
          raw_payload: {
            imageUrls: ['https://8.8.8.8/a.jpg', 'https://127.0.0.1/private.jpg'],
          },
          failure_reasons: [],
        })
      }
      if (table === 'ingested_sales' && call > 1) {
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
  })

  it('consumes raw_payload.imageUrls and keeps only validated external URLs', async () => {
    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById('33333333-3333-4333-8333-333333333333')
    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual(['https://8.8.8.8/a.jpg'])
  })
})
