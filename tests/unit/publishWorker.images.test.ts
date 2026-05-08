import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dnsLookup, loggerWarn, loggerInfo, loggerError, rpcMock, adminDb } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  rpcMock: vi.fn(),
  adminDb: {} as { rpc?: (...args: unknown[]) => unknown },
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

const createPublishedSaleMock = vi.fn()

const mockFromBase = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => {
    adminDb.rpc = rpcMock
    return adminDb
  }),
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

/** Pretend the sale row already has media so maybePatchExistingSaleImages is a no-op. */
function salesMockPatchNoOp() {
  return {
    select: (fields: string) => {
      if (fields === 'id') {
        return {
          eq: () => ({
            limit: async () => ({ data: [{ id: 'existing-sale-for-ingested' }], error: null }),
          }),
        }
      }
      return {
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              ingested_sale_id: '33333333-3333-4333-8333-333333333333',
              title: 'Existing sale title',
              description: 'Existing sale description',
              address: 'Existing address',
              date_start: '2026-05-06',
              date_end: null,
              time_start: '09:00:00',
              time_end: null,
              cover_image_url: 'https://synthetic-post-insert.lootaura.test/skip-patch.jpg',
              images: ['https://synthetic-post-insert.lootaura.test/skip-patch.jpg'],
            },
            error: null,
          }),
        }),
      }
    },
    update: () => ({
      eq: async () => ({ error: null }),
    }),
  }
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
    if (table === 'sales') {
      return salesMockPatchNoOp()
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

describe('publish worker idempotent sale images', () => {
  const ingestedId = '33333333-3333-4333-8333-333333333333'
  const existingSaleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

  function uniqueIngestedSaleViolation() {
    const err = new Error(
      'duplicate key value violates unique constraint "idx_sales_ingested_sale_id_unique"'
    ) as Error & { pgCode?: string }
    err.pgCode = '23505'
    return err
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
  })

  it('on unique conflict, patches existing sale when image fields are empty and sanitized URLs exist', async () => {
    const okUrl = 'https://images.example.org/patch-me.jpg'
    const updateSpy = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              raw_payload: { tags: [] },
              image_source_url: okUrl,
            })
          )
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              return {
                eq: () => ({
                  limit: async () => ({ data: [{ id: existingSaleId }], error: null }),
                }),
              }
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: ingestedId,
                    title: 'Yard Sale',
                    description: '',
                    address: null,
                    date_start: null,
                    date_end: null,
                    time_start: null,
                    time_end: null,
                    cover_image_url: null,
                    images: null,
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => updateSpy(payload),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    createPublishedSaleMock.mockRejectedValueOnce(uniqueIngestedSaleViolation())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(result).toMatchObject({ publishedSaleId: existingSaleId })
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '1 Main St, Chicago, IL',
        date_start: '2026-05-06',
        time_start: '09:00:00',
        cover_image_url: okUrl,
        images: [okUrl],
      })
    )
  })

  it('on unique conflict, does not overwrite existing sale media', async () => {
    const okUrl = 'https://images.example.org/new.jpg'
    const updateSpy = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              raw_payload: { tags: [] },
              image_source_url: okUrl,
            })
          )
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              return {
                eq: () => ({
                  limit: async () => ({ data: [{ id: existingSaleId }], error: null }),
                }),
              }
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: ingestedId,
                    title: 'Custom User Title',
                    description: 'Custom description',
                    address: '5918 Park Ave, Berkeley, IL',
                    date_start: '2026-05-06',
                    date_end: null,
                    time_start: '09:00:00',
                    time_end: null,
                    cover_image_url: 'https://images.example.org/existing-cover.jpg',
                    images: ['https://images.example.org/existing-cover.jpg'],
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => updateSpy(payload),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    createPublishedSaleMock.mockRejectedValueOnce(uniqueIngestedSaleViolation())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '1 Main St, Chicago, IL',
        date_start: '2026-05-06',
        time_start: '09:00:00',
      })
    )
    expect(updateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ images: [okUrl] }))
  })

  it('on unique conflict, expands stale single-image sale to full sanitized image set', async () => {
    const urls = [
      'https://images.example.org/new-1.jpg',
      'https://images.example.org/new-2.jpg',
      'https://images.example.org/new-3.jpg',
    ]
    const updateSpy = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              raw_payload: { imageUrls: urls },
              image_source_url: urls[0],
            })
          )
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              return {
                eq: () => ({
                  limit: async () => ({ data: [{ id: existingSaleId }], error: null }),
                }),
              }
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: ingestedId,
                    title: 'Custom User Title',
                    description: 'Custom description',
                    address: '5918 Park Ave, Berkeley, IL',
                    date_start: '2026-05-06',
                    date_end: null,
                    time_start: '09:00:00',
                    time_end: null,
                    cover_image_url: 'https://images.example.org/new-1.jpg',
                    images: ['https://images.example.org/new-1.jpg'],
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => updateSpy(payload),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    createPublishedSaleMock.mockRejectedValueOnce(uniqueIngestedSaleViolation())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        images: urls,
        cover_image_url: urls[0],
      })
    )
  })

  it('on unique conflict, replaces polluted existing sale description from latest ingest', async () => {
    const okUrl = 'https://images.example.org/patch-desc.jpg'
    const polluted =
      '8:30 am - 5:00 pm 5/9 - 5/9 9001 W 147th St, Orland Park, IL 60462 Street View Directions Source: garagesalefinder.com'
    const updateSpy = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              raw_payload: { tags: [] },
              image_source_url: okUrl,
              description: 'Clean ingest description text.',
            })
          )
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              return {
                eq: () => ({
                  limit: async () => ({ data: [{ id: existingSaleId }], error: null }),
                }),
              }
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: ingestedId,
                    title: 'Yard Sale',
                    description: polluted,
                    address: null,
                    date_start: null,
                    date_end: null,
                    time_start: null,
                    time_end: null,
                    cover_image_url: null,
                    images: null,
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => updateSpy(payload),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    createPublishedSaleMock.mockRejectedValueOnce(uniqueIngestedSaleViolation())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Clean ingest description text.',
      })
    )
  })

  it('on unique conflict, preserves good existing sale description', async () => {
    const okUrl = 'https://images.example.org/keep-desc.jpg'
    const updateSpy = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              raw_payload: { tags: [] },
              image_source_url: okUrl,
              description: 'New ingest description that should not overwrite.',
            })
          )
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              return {
                eq: () => ({
                  limit: async () => ({ data: [{ id: existingSaleId }], error: null }),
                }),
              }
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: ingestedId,
                    title: 'Custom User Title',
                    description: 'Hand-written curated description that should be preserved.',
                    address: '5918 Park Ave, Berkeley, IL',
                    date_start: '2026-05-06',
                    date_end: null,
                    time_start: '09:00:00',
                    time_end: null,
                    cover_image_url: 'https://images.example.org/existing-cover.jpg',
                    images: ['https://images.example.org/existing-cover.jpg'],
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => updateSpy(payload),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    createPublishedSaleMock.mockRejectedValueOnce(uniqueIngestedSaleViolation())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(updateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'New ingest description that should not overwrite.',
      })
    )
  })

  it('image patch failure does not fail publish', async () => {
    const okUrl = 'https://images.example.org/patch-me.jpg'
    const updateSpy = vi.fn().mockReturnValue({
      eq: async () => ({ error: { message: 'simulated update failure' } }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              raw_payload: { tags: [] },
              image_source_url: okUrl,
            })
          )
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              return {
                eq: () => ({
                  limit: async () => ({ data: [{ id: existingSaleId }], error: null }),
                }),
              }
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: ingestedId,
                    title: 'Yard Sale',
                    description: '',
                    address: null,
                    date_start: null,
                    date_end: null,
                    time_start: null,
                    time_end: null,
                    cover_image_url: null,
                    images: null,
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => updateSpy(payload),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    createPublishedSaleMock.mockRejectedValueOnce(uniqueIngestedSaleViolation())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(updateSpy).toHaveBeenCalled()
  })

  it('normal first insert still sets images on create payload and skips redundant sale update', async () => {
    const url = 'https://images.example.org/first-insert.jpg'
    const salesImageUpdate = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) {
          return makeClaimBuilder(
            baseRow({
              raw_payload: { tags: [] },
              image_source_url: url,
            })
          )
        }
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: (_fields: string) => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  ingested_sale_id: ingestedId,
                  title: 'Sale',
                  description: 'Existing sale description',
                  address: '1 Main St, Chicago, IL',
                  date_start: '2026-05-06',
                  date_end: null,
                  time_start: '09:00:00',
                  time_end: null,
                  cover_image_url: 'https://synthetic-post-insert.lootaura.test/skip-patch.jpg',
                  images: [url],
                },
                error: null,
              }),
            }),
          }),
          update: (payload: unknown) => salesImageUpdate(payload),
        }
      }
      return {
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    })

    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-new' })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual([url])
    expect(salesImageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '1 Main St, Chicago, IL',
        date_start: '2026-05-06',
        time_start: '09:00:00',
      })
    )
    expect(salesImageUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ images: [url] }))
  })

  it('invalid image_source_url still publishes with only validated URLs on create payload', async () => {
    mockIngestedSalesClaimSequence(
      baseRow({
        raw_payload: { imageUrls: ['https://images.example.org/ok.jpg'] },
        image_source_url: 'https://127.0.0.1/bad.jpg',
      })
    )
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-1' })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual(['https://images.example.org/ok.jpg'])
  })
})

describe('publish worker batch media hydration and visibility', () => {
  const rowId = '44444444-4444-4444-8444-444444444444'

  function baseBatchRow(overrides: Record<string, unknown> = {}) {
    return {
      id: rowId,
      source_platform: 'external_page_source',
      source_url: 'https://example.com/listing/2',
      title: 'Batch Sale',
      description: null,
      normalized_address: '2 Main St',
      city: 'Austin',
      state: 'TX',
      zip_code: null,
      lat: 30.2,
      lng: -97.7,
      date_start: '2026-05-06',
      date_end: null,
      time_start: '10:00:00',
      time_end: null,
      image_cloudinary_url: null,
      failure_reasons: [],
      ...overrides,
    }
  }

  function buildBatchUpdateBuilder() {
    return {
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }
  }

  function mockBatchFromBase(opts: {
    hydrationRows?: unknown[]
    hydrationError?: { message: string } | null
  } = {}) {
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        let mode: 'update' | 'select' = 'update'
        return {
          update: () => {
            mode = 'update'
            return {
              eq: async () => ({ error: null }),
            }
          },
          select: (_fields: string) => {
            mode = 'select'
            return {
              in: async () => ({ data: opts.hydrationRows ?? [], error: opts.hydrationError ?? null }),
            }
          },
          eq: async () => {
            if (mode === 'update') return { error: null }
            return { data: opts.hydrationRows ?? [], error: opts.hydrationError ?? null }
          },
        }
      }
      if (table === 'sales') return salesMockPatchNoOp()
      return buildBatchUpdateBuilder()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-batch-1' })
  })

  it('uses image_source_url from RPC claim row to publish image_urls', async () => {
    rpcMock.mockResolvedValue({
      data: [baseBatchRow({ image_source_url: 'https://images.example.org/rpc-source.jpg', raw_payload: { tags: [] } })],
      error: null,
    })
    mockBatchFromBase()

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()
    expect(summary.succeeded).toBe(1)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual(['https://images.example.org/rpc-source.jpg'])
  })

  it('uses raw_payload.imageUrls from RPC claim row to publish image_urls', async () => {
    rpcMock.mockResolvedValue({
      data: [
        baseBatchRow({
          raw_payload: { imageUrls: ['https://images.example.org/from-raw.jpg'] },
          image_source_url: null,
        }),
      ],
      error: null,
    })
    mockBatchFromBase()

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()
    expect(summary.succeeded).toBe(1)
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual(['https://images.example.org/from-raw.jpg'])
  })

  it('falls back to hydration when RPC row lacks media fields', async () => {
    rpcMock.mockResolvedValue({
      data: [baseBatchRow({})],
      error: null,
    })
    mockBatchFromBase({
      hydrationRows: [{ id: rowId, raw_payload: { tags: [] }, image_source_url: 'https://images.example.org/hydrated.jpg' }],
    })

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()
    expect(summary.succeeded).toBe(1)
    expect(loggerInfo).toHaveBeenCalledWith(
      'Publish worker media hydration fallback engaged',
      expect.objectContaining({ operation: 'hydrate_claimed_rows_media_fallback' })
    )
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual(['https://images.example.org/hydrated.jpg'])
  })

  it('logs hydration fallback failure and still publishes without images', async () => {
    rpcMock.mockResolvedValue({
      data: [baseBatchRow({})],
      error: null,
    })
    mockBatchFromBase({
      hydrationError: { message: 'hydration_select_failed' },
    })

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()
    expect(summary.succeeded).toBe(1)
    expect(loggerWarn).toHaveBeenCalledWith(
      'Publish worker media hydration fallback failed; proceeding without hydrated media fields',
      expect.objectContaining({ operation: 'hydrate_claimed_rows_media_fallback' })
    )
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual([])
  })

  it('treats null image_source_url as present-null (no missing media field warning)', async () => {
    rpcMock.mockResolvedValue({
      data: [baseBatchRow({ raw_payload: { tags: [] }, image_source_url: null })],
      error: null,
    })
    mockBatchFromBase()

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSales()
    expect(loggerWarn).not.toHaveBeenCalledWith(
      'Publish claim row missing expected media fields',
      expect.anything()
    )
  })

  it('logs when candidates sanitize to zero and still publishes', async () => {
    rpcMock.mockResolvedValue({
      data: [
        baseBatchRow({
          raw_payload: { imageUrls: ['https://127.0.0.1/private.jpg'] },
          image_source_url: null,
        }),
      ],
      error: null,
    })
    mockBatchFromBase()

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()
    expect(summary.succeeded).toBe(1)
    expect(loggerWarn).toHaveBeenCalledWith(
      'Publish image candidates rejected by sanitizer; continuing without images',
      expect.objectContaining({ operation: 'sanitize_external_images', candidateCount: 1 })
    )
    const body = createPublishedSaleMock.mock.calls[0][0]
    expect(body.image_urls).toEqual([])
  })

  it('rejection logs do not include raw URL values', async () => {
    rpcMock.mockResolvedValue({
      data: [
        baseBatchRow({
          raw_payload: { imageUrls: ['https://127.0.0.1/private.jpg'] },
          image_source_url: null,
        }),
      ],
      error: null,
    })
    mockBatchFromBase()

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSales()
    const rejectionCall = loggerWarn.mock.calls.find((c) => c[0] === 'Publish image candidate rejected')
    expect(rejectionCall).toBeTruthy()
    expect(JSON.stringify(rejectionCall?.[1] ?? {})).not.toContain('127.0.0.1/private.jpg')
  })
})

describe('publish worker finalization consistency', () => {
  const ingestedId = '55555555-5555-4555-8555-555555555555'

  function singleClaimRow(overrides: Record<string, unknown> = {}) {
    return baseRow({
      id: ingestedId,
      raw_payload: { tags: [] },
      image_source_url: null,
      published_sale_id: null,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
  })

  it('sale created + finalization update success marks ingested row published', async () => {
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-final-1' })
    const finalizeUpdate = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) return makeClaimBuilder(singleClaimRow())
        return { update: (payload: unknown) => finalizeUpdate(payload) }
      }
      if (table === 'sales') return salesMockPatchNoOp()
      return { update: () => ({ eq: async () => ({ error: null }) }) }
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)
    expect(finalizeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        published_sale_id: 'sale-final-1',
      })
    )
  })

  it('sale created + first finalization update failure retries and succeeds', async () => {
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-final-2' })
    const finalizeUpdate = vi
      .fn()
      .mockReturnValueOnce({ eq: async () => ({ error: { message: 'transient' } }) })
      .mockReturnValueOnce({ eq: async () => ({ error: null }) })

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) return makeClaimBuilder(singleClaimRow())
        return { update: (payload: unknown) => finalizeUpdate(payload) }
      }
      if (table === 'sales') return salesMockPatchNoOp()
      return { update: () => ({ eq: async () => ({ error: null }) }) }
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).toHaveBeenCalledTimes(1)
    expect(finalizeUpdate).toHaveBeenCalledTimes(2)
  })

  it('ready row with published_sale_id finalizes without recreating sale', async () => {
    createPublishedSaleMock.mockResolvedValue({ saleId: 'should-not-be-used' })
    const finalizeUpdate = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })
    const syncUpdate = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })
    const linkedSaleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) return makeClaimBuilder(singleClaimRow({ published_sale_id: linkedSaleId }))
        return { update: (payload: unknown) => finalizeUpdate(payload) }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              const q = {
                eq: (_k: string, _v: unknown) => q,
                limit: async () => ({ data: [{ id: linkedSaleId }], error: null }),
              }
              return q
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: ingestedId,
                    title: 'Yard Sale',
                    description: '',
                    address: null,
                    date_start: null,
                    date_end: null,
                    time_start: null,
                    time_end: null,
                    cover_image_url: null,
                    images: null,
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => syncUpdate(payload),
        }
      }
      return { update: () => ({ eq: async () => ({ error: null }) }) }
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).not.toHaveBeenCalled()
    expect(syncUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '1 Main St, Chicago, IL',
        date_start: '2026-05-06',
        time_start: '09:00:00',
      })
    )
    expect(finalizeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        published_sale_id: linkedSaleId,
      })
    )
  })

  it('linked sale ownership mismatch prevents sale sync and still finalizes', async () => {
    const finalizeUpdate = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })
    const syncUpdate = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    })
    const linkedSaleId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        const n = mockFromBase.mock.calls.filter((c) => c[1] === 'ingested_sales').length
        if (n === 1) return makeClaimBuilder(singleClaimRow({ published_sale_id: linkedSaleId }))
        return { update: (payload: unknown) => finalizeUpdate(payload) }
      }
      if (table === 'sales') {
        return {
          select: (fields: string) => {
            if (fields === 'id') {
              const q = {
                eq: (_k: string, _v: unknown) => q,
                limit: async () => ({ data: [{ id: linkedSaleId }], error: null }),
              }
              return q
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ingested_sale_id: 'different-ingested-row-id',
                    title: 'Yard Sale',
                    description: '',
                    address: null,
                    date_start: null,
                    date_end: null,
                    time_start: null,
                    time_end: null,
                    cover_image_url: null,
                    images: null,
                  },
                  error: null,
                }),
              }),
            }
          },
          update: (payload: unknown) => syncUpdate(payload),
        }
      }
      return { update: () => ({ eq: async () => ({ error: null }) }) }
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(ingestedId)
    expect(result.ok).toBe(true)
    expect(syncUpdate).not.toHaveBeenCalled()
    expect(finalizeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        published_sale_id: linkedSaleId,
      })
    )
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
