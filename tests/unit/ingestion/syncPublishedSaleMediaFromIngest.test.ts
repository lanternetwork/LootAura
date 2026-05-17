import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  sanitizeExternalImageUrls: vi.fn(),
  saleUpdatePayload: null as Record<string, unknown> | null,
  ingestStatus: 'published',
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn((_admin: unknown, table: string) => {
    if (table === 'ingested_sales') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                published_sale_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                city: 'Chicago',
                state: 'IL',
                status: hoisted.ingestStatus,
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'sales') {
      const saleRow = {
        ingested_sale_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        cover_image_url: null as string | null,
        images: [] as string[],
        description: 'Yard sale',
        moderation_status: null as string | null,
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: saleRow, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          hoisted.saleUpdatePayload = payload
          return {
            eq: async () => ({ error: null }),
          }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  }),
}))

vi.mock('@/lib/ingestion/externalImageValidation', () => ({
  sanitizeExternalImageUrls: hoisted.sanitizeExternalImageUrls,
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const ROW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GOOD_A = 'https://cdn.example.com/a.jpg'
const GOOD_B = 'https://cdn.example.com/b.jpg'

describe('syncPublishedSaleMediaFromIngestedRow', () => {
  beforeEach(() => {
    vi.resetModules()
    hoisted.saleUpdatePayload = null
    hoisted.ingestStatus = 'published'
    hoisted.sanitizeExternalImageUrls.mockReset()
    hoisted.sanitizeExternalImageUrls.mockImplementation(async (candidates: unknown) => {
      if (!Array.isArray(candidates)) return []
      return candidates.filter((u): u is string => typeof u === 'string')
    })
  })

  it('updates sales.cover_image_url and sales.images when linked sale is empty', async () => {
    const { syncPublishedSaleMediaFromIngestedRow } = await import(
      '@/lib/ingestion/images/syncPublishedSaleMediaFromIngest'
    )
    const result = await syncPublishedSaleMediaFromIngestedRow({
      rowId: ROW_ID,
      imageSourceUrl: GOOD_A,
      rawPayload: { imageUrls: [GOOD_A, GOOD_B] },
      city: 'Chicago',
      state: 'IL',
    })

    expect(result.outcome).toBe('updated_full')
    expect(hoisted.saleUpdatePayload).toEqual({
      cover_image_url: GOOD_A,
      images: [GOOD_A, GOOD_B],
    })
  })

  it('preserves existing healthy gallery (intent none)', async () => {
    const { fromBase } = await import('@/lib/supabase/clients')
    vi.mocked(fromBase).mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  published_sale_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  city: 'Chicago',
                  state: 'IL',
                  status: 'published',
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  ingested_sale_id: ROW_ID,
                  cover_image_url: GOOD_A,
                  images: [GOOD_A, GOOD_B, 'https://cdn.example.com/c.jpg'],
                  description: 'Estate sale with tools and furniture.',
                  moderation_status: null,
                },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            hoisted.saleUpdatePayload = payload
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    hoisted.sanitizeExternalImageUrls.mockResolvedValue([GOOD_A, GOOD_B])

    const { syncPublishedSaleMediaFromIngestedRow } = await import(
      '@/lib/ingestion/images/syncPublishedSaleMediaFromIngest'
    )
    const result = await syncPublishedSaleMediaFromIngestedRow({
      rowId: ROW_ID,
      imageSourceUrl: GOOD_A,
      rawPayload: { imageUrls: [GOOD_A, GOOD_B] },
    })

    expect(result.outcome).toBe('intent_none')
    expect(hoisted.saleUpdatePayload).toBeNull()
  })

  it('does not update sales when all candidates fail sanitization', async () => {
    hoisted.sanitizeExternalImageUrls.mockResolvedValue([])

    const { syncPublishedSaleMediaFromIngestedRow } = await import(
      '@/lib/ingestion/images/syncPublishedSaleMediaFromIngest'
    )
    const result = await syncPublishedSaleMediaFromIngestedRow({
      rowId: ROW_ID,
      imageSourceUrl: 'https://cdn.example.com/bad.png',
      rawPayload: { imageUrls: ['https://cdn.example.com/bad.png'] },
    })

    expect(result.outcome).toBe('all_candidates_rejected')
    expect(hoisted.saleUpdatePayload).toBeNull()
  })

  it('skips unpublished rows without touching sales', async () => {
    const { fromBase } = await import('@/lib/supabase/clients')
    vi.mocked(fromBase).mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  published_sale_id: null,
                  city: 'Chicago',
                  state: 'IL',
                  status: 'ready',
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          update: () => {
            throw new Error('sales should not be updated')
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { syncPublishedSaleMediaFromIngestedRow } = await import(
      '@/lib/ingestion/images/syncPublishedSaleMediaFromIngest'
    )
    const result = await syncPublishedSaleMediaFromIngestedRow({
      rowId: ROW_ID,
      imageSourceUrl: GOOD_A,
      rawPayload: { imageUrls: [GOOD_A] },
    })

    expect(result.outcome).toBe('not_linked')
    expect(hoisted.saleUpdatePayload).toBeNull()
  })

  it('does not update ingested_sales status (sales-only patch)', async () => {
    const ingestUpdates: unknown[] = []
    const { fromBase } = await import('@/lib/supabase/clients')
    vi.mocked(fromBase).mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  published_sale_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  city: 'Chicago',
                  state: 'IL',
                  status: 'published',
                },
                error: null,
              }),
            }),
          }),
          update: (payload: unknown) => {
            ingestUpdates.push(payload)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  ingested_sale_id: ROW_ID,
                  cover_image_url: null,
                  images: [],
                  description: null,
                  moderation_status: null,
                },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            hoisted.saleUpdatePayload = payload
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { syncPublishedSaleMediaFromIngestedRow } = await import(
      '@/lib/ingestion/images/syncPublishedSaleMediaFromIngest'
    )
    await syncPublishedSaleMediaFromIngestedRow({
      rowId: ROW_ID,
      imageSourceUrl: GOOD_A,
      rawPayload: { imageUrls: [GOOD_A] },
    })

    expect(ingestUpdates).toHaveLength(0)
    expect(hoisted.saleUpdatePayload).not.toBeNull()
  })
})
