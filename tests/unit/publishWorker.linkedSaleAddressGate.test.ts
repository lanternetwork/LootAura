import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dnsLookup, loggerInfo, loggerWarn, loggerError, adminDb } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  adminDb: {} as Record<string, unknown>,
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

const createPublishedSaleMock = vi.fn()

const mockFromBase = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => adminDb),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: (...args: unknown[]) => createPublishedSaleMock(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfo(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: (...args: unknown[]) => loggerError(...args),
  },
}))

const INGESTED_ID = '55555555-5555-4555-8555-555555555555'
const LINKED_SALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INGESTED_ID,
    source_platform: 'external_page_source',
    source_url: 'https://example.com/listing/linked',
    title: 'Linked sale',
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

describe('publishWorker linked sale path address gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(0), { status: 206 })))
  })

  it('fails closed to publish_failed when linked row has placeholder address (no createPublishedSale)', async () => {
    const row = baseRow({
      published_sale_id: LINKED_SALE_ID,
      normalized_address: 'Unknown address, Chicago, IL',
    })

    let ingestedSalesCalls = 0
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        ingestedSalesCalls += 1
        if (ingestedSalesCalls === 1) {
          return makeClaimBuilder(row)
        }
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: [{ id: LINKED_SALE_ID }], error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(INGESTED_ID)

    expect(result.ok).toBe(false)
    expect(createPublishedSaleMock).not.toHaveBeenCalled()
    expect(ingestedSalesCalls).toBeGreaterThanOrEqual(2)
  })

  it('still completes when linked row has valid address', async () => {
    const row = baseRow({
      published_sale_id: LINKED_SALE_ID,
      normalized_address: '10 Oak St',
      raw_payload: {},
      image_source_url: null,
    })

    let ingestedSalesCalls = 0
    let salesCalls = 0
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        ingestedSalesCalls += 1
        if (ingestedSalesCalls === 1) {
          return makeClaimBuilder(row)
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        salesCalls += 1
        if (salesCalls === 1) {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: [{ id: LINKED_SALE_ID }], error: null }),
                }),
              }),
            }),
          }
        }
        if (salesCalls === 2) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: INGESTED_ID,
                    title: 'Yard Sale',
                    description: '',
                    address: '10 Oak St, Chicago, IL',
                    city: 'Chicago',
                    state: 'IL',
                    date_start: '2026-05-06',
                    date_end: null,
                    time_start: '09:00:00',
                    time_end: null,
                    cover_image_url: 'https://images.example.org/cover.jpg',
                    images: ['https://images.example.org/cover.jpg'],
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      return {}
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(INGESTED_ID)

    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).not.toHaveBeenCalled()
  })
})
