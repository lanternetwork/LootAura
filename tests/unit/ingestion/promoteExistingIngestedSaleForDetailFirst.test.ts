import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({ from: mockFrom }),
  fromBase: (db: { from: typeof mockFrom }, table: string) => db.from(table),
}))

describe('promoteExistingIngestedSaleForDetailFirst', () => {
  beforeEach(() => {
    mockFrom.mockReset()
  })

  it('updates unpublished row by source_url and returns id', async () => {
    const { promoteExistingIngestedSaleForDetailFirst } = await import(
      '@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst'
    )
    const updateMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'sale-1' }, error: null })
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'sale-1',
                    status: 'needs_geocode',
                    published_sale_id: null,
                    is_duplicate: false,
                    superseded_by_ingested_sale_id: null,
                  },
                ],
                error: null,
              }),
            })),
          })),
        })),
      })
      .mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: updateMaybeSingle,
            })),
          })),
        })),
      })

    const admin = (await import('@/lib/supabase/clients')).getAdminDb()
    const result = await promoteExistingIngestedSaleForDetailFirst(admin, {
      sourceUrl: 'https://example.com/listing.html',
      row: { status: 'ready' },
    })

    expect(result).toEqual({ id: 'sale-1' })
  })

  it('findPublishedIngestedSaleIdForDetailFirst returns id when published row exists', async () => {
    const { findPublishedIngestedSaleIdForDetailFirst } = await import(
      '@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst'
    )
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'pub-9' }, error: null })
    const limit = vi.fn(() => ({ maybeSingle }))
    const not = vi.fn(() => ({ limit }))
    const eqChain = {
      eq: vi.fn(function (this: unknown) {
        return eqChain
      }),
      not,
    }
    mockFrom.mockReturnValue({
      select: vi.fn(() => eqChain),
    })

    const admin = (await import('@/lib/supabase/clients')).getAdminDb()
    const id = await findPublishedIngestedSaleIdForDetailFirst(
      admin,
      'https://example.com/listing.html'
    )
    expect(id).toBe('pub-9')
  })
})
