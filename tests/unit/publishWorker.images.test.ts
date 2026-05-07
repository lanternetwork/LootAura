import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dnsLookup } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

const createPublishedSaleMock = vi.fn()

const mockFromBase = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: (...args: unknown[]) => createPublishedSaleMock(...args),
}))

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
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
    failure_reasons: [],
    ...overrides,
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

describe('publish worker image consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-1' })
  })

  it('consumes raw_payload.imageUrls and keeps only validated external URLs', async () => {
    mockIngestedSalesClaimSequence(
      baseRow({
        raw_payload: {
          imageUrls: ['https://8.8.8.8/a.jpg', 'https://127.0.0.1/private.jpg'],
        },
        image_source_url: null,
      })
    )

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById('33333333-3333-4333-8333-333333333333')
    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual(['https://8.8.8.8/a.jpg'])
  })

  it('consumes image_source_url when raw_payload has no imageUrls', async () => {
    const url = 'https://images.example.org/from-extension.jpg'
    mockIngestedSalesClaimSequence(
      baseRow({
        raw_payload: { tags: [] },
        image_source_url: url,
      })
    )

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById('33333333-3333-4333-8333-333333333333')
    expect(result.ok).toBe(true)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual([url])
  })

  it('dedupes the same URL in raw_payload.imageUrls and image_source_url', async () => {
    const url = 'https://images.example.org/one.jpg'
    mockIngestedSalesClaimSequence(
      baseRow({
        raw_payload: { imageUrls: [url] },
        image_source_url: url,
      })
    )

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSaleById('33333333-3333-4333-8333-333333333333')
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual([url])
  })

  it('skips invalid image_source_url and still publishes with valid raw_payload URLs', async () => {
    mockIngestedSalesClaimSequence(
      baseRow({
        raw_payload: { imageUrls: ['https://images.example.org/ok.jpg'] },
        image_source_url: 'https://127.0.0.1/bad.jpg',
      })
    )

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById('33333333-3333-4333-8333-333333333333')
    expect(result.ok).toBe(true)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual(['https://images.example.org/ok.jpg'])
  })

  it('enforces max 3 images after validation', async () => {
    const urls = [
      'https://a.example.org/1.jpg',
      'https://b.example.org/2.jpg',
      'https://c.example.org/3.jpg',
      'https://d.example.org/4.jpg',
    ]
    mockIngestedSalesClaimSequence(
      baseRow({
        raw_payload: { imageUrls: urls },
        image_source_url: null,
      })
    )

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSaleById('33333333-3333-4333-8333-333333333333')
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls?.length).toBe(3)
    expect(body.image_urls).toEqual(urls.slice(0, 3))
  })
})

describe('extractPublishImageCandidates', () => {
  it('orders raw_payload first then image_source_url', async () => {
    const { extractPublishImageCandidates } = await import('@/lib/ingestion/publishWorker')
    expect(
      extractPublishImageCandidates(
        { imageUrls: ['https://first.example/a.jpg'] },
        'https://second.example/b.jpg'
      )
    ).toEqual(['https://first.example/a.jpg', 'https://second.example/b.jpg'])
  })
})
