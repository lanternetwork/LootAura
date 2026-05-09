import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * publishWorker finalize-failure recovery: sale row exists but ingested_sales
 * cannot be marked published; retry must reuse the existing sale (linked
 * published_sale_id) without a second createPublishedSale success path.
 */

const { dnsLookup, loggerInfo, loggerWarn, loggerError, adminDb } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  adminDb: {} as { rpc?: (...args: unknown[]) => unknown },
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

const INGESTED_ID = '44444444-4444-4444-8444-444444444444'
const PUBLISHED_SALE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const FIXED_NOW = '2026-05-08T15:30:00.000Z'
const FINALIZE_ERR = 'simulated finalize ingested_sales failure'

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INGESTED_ID,
    source_platform: 'external_page_source',
    source_url: 'https://example.com/listing/finalize-recovery',
    title: 'Finalize recovery sale',
    description: null,
    normalized_address: '2 Oak Ave',
    city: 'Madison',
    state: 'WI',
    zip_code: null,
    lat: 43.07,
    lng: -89.38,
    date_start: '2026-05-10',
    date_end: null,
    time_start: '10:00:00',
    time_end: null,
    image_cloudinary_url: null,
    raw_payload: {},
    image_source_url: null as string | null,
    failure_reasons: [] as unknown[],
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

function salesMockForPublish(opts: { phase: 'first_publish' | 'second_publish' }) {
  const syncRow = {
    ingested_sale_id: INGESTED_ID,
    title: 'Yard Sale',
    description: '',
    address: null,
    date_start: null,
    date_end: null,
    time_start: null,
    time_end: null,
    cover_image_url: 'https://images.example.org/existing-cover.jpg',
    images: ['https://images.example.org/existing-cover.jpg'],
  }

  return {
    select: (fields: string) => {
      if (fields === 'id') {
        return {
          eq: (col: string, val: unknown) => {
            if (col === 'ingested_sale_id') {
              return {
                limit: async () => ({ data: [], error: null }),
              }
            }
            if (col === 'id' && val === PUBLISHED_SALE_ID) {
              return {
                eq: (col2: string, val2: unknown) => ({
                  limit: async () => {
                    if (
                      opts.phase === 'second_publish' &&
                      col2 === 'ingested_sale_id' &&
                      val2 === INGESTED_ID
                    ) {
                      return { data: [{ id: PUBLISHED_SALE_ID }], error: null }
                    }
                    return { data: [], error: null }
                  },
                }),
              }
            }
            return {
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
              limit: async () => ({ data: [], error: null }),
            }
          },
        }
      }
      return {
        eq: () => ({
          maybeSingle: async () => ({ data: syncRow, error: null }),
        }),
      }
    },
    update: () => ({
      eq: async () => ({ error: null }),
    }),
  }
}

describe('publishWorker finalize failure recovery (single-id path)', () => {
  let markFailedPayload: Record<string, unknown> | null = null
  let publishedUpdatePayload: Record<string, unknown> | null = null

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(FIXED_NOW) })
    markFailedPayload = null
    publishedUpdatePayload = null
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    createPublishedSaleMock.mockResolvedValue({ saleId: PUBLISHED_SALE_ID })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              published_sale_id: null,
            })
          )
        }
        if (n === 2 || n === 3) {
          return {
            update: () => ({
              eq: async () => ({ error: { message: FINALIZE_ERR } }),
            }),
          }
        }
        if (n === 4) {
          return {
            update: (payload: Record<string, unknown>) => ({
              eq: () => ({
                eq: async () => {
                  markFailedPayload = payload
                  return { error: null }
                },
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
      if (table === 'sales') {
        return salesMockForPublish({ phase: 'first_publish' })
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('after finalize failure, retry uses linked published_sale_id without a second create; row publishes with deterministic timestamp', async () => {
    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')

    const first = await publishReadyIngestedSaleById(INGESTED_ID)
    expect(first.ok).toBe(false)
    expect(first).toMatchObject({ error: FINALIZE_ERR })
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)

    expect(markFailedPayload).not.toBeNull()
    expect(markFailedPayload?.status).toBe('publish_failed')
    expect(markFailedPayload?.failure_reasons).toEqual(['publish_error'])
    const details = markFailedPayload?.failure_details as Record<string, unknown> | undefined
    expect(details?.phase).toBe('finalize_ingested_row')
    expect(details?.operation).toBe('finalize_after_sale_create_single')
    expect(details?.publish_error).toBe(FINALIZE_ERR)
    expect(details?.published_sale_id).toBe(PUBLISHED_SALE_ID)
    expect(details?.region).toEqual({ city: 'Madison', state: 'WI' })

    mockFromBase.mockClear()
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              published_sale_id: PUBLISHED_SALE_ID,
            })
          )
        }
        if (n === 2) {
          return {
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                publishedUpdatePayload = payload
                return { error: null }
              },
            }),
          }
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return salesMockForPublish({ phase: 'second_publish' })
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    const second = await publishReadyIngestedSaleById(INGESTED_ID)
    expect(second.ok).toBe(true)
    expect(second).toMatchObject({ publishedSaleId: PUBLISHED_SALE_ID })
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)

    expect(publishedUpdatePayload).not.toBeNull()
    expect(publishedUpdatePayload?.status).toBe('published')
    expect(publishedUpdatePayload?.published_sale_id).toBe(PUBLISHED_SALE_ID)
    expect(publishedUpdatePayload?.published_at).toBe(FIXED_NOW)
  })
})
