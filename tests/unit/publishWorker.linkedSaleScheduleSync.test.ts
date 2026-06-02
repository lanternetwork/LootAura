import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveEndsAtMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ends_at: '2026-06-01T21:00:00.000Z',
    listing_timezone: 'America/Chicago',
  })
)

const { dnsLookup, loggerWarn, createPublishedSaleMock, mockFromBase, ctx } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  loggerWarn: vi.fn(),
  createPublishedSaleMock: vi.fn(),
  mockFromBase: vi.fn(),
  ctx: {
    saleUpdatePayloads: [] as unknown[],
    ingestedUpdatePayloads: [] as unknown[],
    mirrorIngestPayloads: [] as unknown[],
    saleSelectCalls: 0,
  },
}))

vi.mock('@/lib/sales/resolvePersistableSaleEndsAt', () => ({
  resolvePersistableSaleEndsAt: resolveEndsAtMock,
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: (...args: unknown[]) => createPublishedSaleMock(...args),
}))

vi.mock('@/lib/ingestion/externalImageValidation', () => ({
  sanitizeExternalImageUrls: async () => [],
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

const INGESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LINKED_SALE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function oakLawnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INGESTED_ID,
    source_platform: 'external_page_source',
    source_url: 'https://example.com/oak-lawn',
    title: 'Oak Lawn Sale',
    description:
      'front door at 8am each sale day. Estate sale in Oak Lawn. 9:00 am - 3:00 pm.',
    normalized_address: '1 Main St',
    city: 'Oak Lawn',
    state: 'IL',
    zip_code: '60453',
    lat: 41.72,
    lng: -87.75,
    date_start: '2026-06-01',
    date_end: '2026-06-01',
    time_start: '08:00:00',
    time_end: '14:00:00',
    image_cloudinary_url: null,
    image_source_url: null,
    raw_payload: { keep: true },
    published_sale_id: LINKED_SALE_ID,
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

function linkedSaleRow(overrides: Record<string, unknown> = {}) {
  return {
    ingested_sale_id: INGESTED_ID,
    title: 'Oak Lawn Sale',
    description: 'Old description body.',
    address: '1 Main St, Oak Lawn, IL',
    city: 'Oak Lawn',
    state: 'IL',
    zip_code: '60453',
    lat: 41.72,
    lng: -87.75,
    date_start: '2026-06-01',
    date_end: '2026-06-01',
    time_start: '08:00:00',
    time_end: '14:00:00',
    cover_image_url: null,
    images: [],
    moderation_status: null,
    ...overrides,
  }
}

describe('publishWorker linked sale schedule sync (reingest)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
    vi.clearAllMocks()
    ctx.saleUpdatePayloads.length = 0
    ctx.ingestedUpdatePayloads.length = 0
    ctx.mirrorIngestPayloads.length = 0
    ctx.saleSelectCalls = 0
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(0), { status: 206 })))
    resolveEndsAtMock.mockReset()
    resolveEndsAtMock.mockResolvedValue({
      ends_at: '2026-06-01T21:00:00.000Z',
      listing_timezone: 'America/Chicago',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function wireLinkedMocks(saleRow: Record<string, unknown>) {
    let ingestedCalls = 0
    let salesCalls = 0
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        ingestedCalls += 1
        if (ingestedCalls === 1) {
          return makeClaimBuilder(oakLawnRow())
        }
        return {
          update: (payload: unknown) => {
            ctx.ingestedUpdatePayloads.push(payload)
            return { eq: async () => ({ error: null }) }
          },
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
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                ctx.saleSelectCalls += 1
                if (ctx.saleSelectCalls === 1) {
                  return { data: saleRow, error: null }
                }
                return {
                  data: {
                    date_start: '2026-06-01',
                    date_end: '2026-06-01',
                    time_start: '09:00:00',
                    time_end: '15:00:00',
                    listing_timezone: 'America/Chicago',
                  },
                  error: null,
                }
              },
            }),
          }),
          update: (payload: unknown) => {
            ctx.saleUpdatePayloads.push(payload)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      return { update: () => ({ eq: async () => ({ error: null }) }) }
    })
  }

  it('updates stale 8–2 sale to prose 9–3 on linked reingest', async () => {
    wireLinkedMocks(linkedSaleRow())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(INGESTED_ID)

    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).not.toHaveBeenCalled()
    expect(ctx.saleUpdatePayloads.length).toBeGreaterThan(0)
    expect(ctx.saleUpdatePayloads[0]).toMatchObject({
      time_start: '09:00:00',
      time_end: '15:00:00',
      ends_at: '2026-06-01T21:00:00.000Z',
      listing_timezone: 'America/Chicago',
    })
    expect(ctx.ingestedUpdatePayloads.some((p) => (p as { time_start?: string }).time_start === '09:00:00')).toBe(
      true
    )
  })

  it('does not churn schedule when sale already matches canonical bundle', async () => {
    wireLinkedMocks(
      linkedSaleRow({
        time_start: '09:00:00',
        time_end: '15:00:00',
      })
    )

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSaleById(INGESTED_ID)

    const schedulePayload = ctx.saleUpdatePayloads.find(
      (p) => (p as { time_start?: string }).time_start != null
    )
    expect(schedulePayload).toBeUndefined()
  })

  it('skips schedule mutation when ends_at cannot be resolved', async () => {
    resolveEndsAtMock.mockResolvedValueOnce({ ends_at: null, listing_timezone: null })
    wireLinkedMocks(linkedSaleRow())

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSaleById(INGESTED_ID)

    expect(ctx.saleUpdatePayloads[0]).not.toMatchObject({
      time_start: '09:00:00',
      time_end: '15:00:00',
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      'Linked sale schedule sync skipped',
      expect.objectContaining({
        operation: 'sync_existing_sale_from_ingest_schedule',
        schedule_mutation_inhibited_reason: 'ends_at_unresolved',
      })
    )
  })

  it('skips linked sale sync when hidden_by_admin', async () => {
    wireLinkedMocks(linkedSaleRow({ moderation_status: 'hidden_by_admin' }))

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSaleById(INGESTED_ID)

    expect(ctx.saleUpdatePayloads).toHaveLength(0)
  })

  it('skips schedule when bundle fails (invalid dates)', async () => {
    let ingestedCalls = 0
    let salesCalls = 0
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        ingestedCalls += 1
        if (ingestedCalls === 1) {
          return makeClaimBuilder(oakLawnRow({ date_start: 'not-a-date', date_end: 'not-a-date' }))
        }
        return {
          update: (payload: unknown) => {
            ctx.ingestedUpdatePayloads.push(payload)
            return { eq: async () => ({ error: null }) }
          },
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
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: linkedSaleRow(), error: null }),
            }),
          }),
          update: (payload: unknown) => {
            ctx.saleUpdatePayloads.push(payload)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      return { update: () => ({ eq: async () => ({ error: null }) }) }
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSaleById(INGESTED_ID)

    expect(ctx.saleUpdatePayloads[0]).not.toMatchObject({
      time_start: '09:00:00',
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      'Linked sale schedule sync skipped',
      expect.objectContaining({
        schedule_bundle_reason: 'invalid_schedule_dates',
      })
    )
  })
})
