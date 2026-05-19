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
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'sale-1' }, error: null })
    const select = vi.fn(() => ({ maybeSingle }))
    const chain = {
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              in: vi.fn(() => ({ select })),
            })),
          })),
        })),
      })),
    }
    mockFrom.mockReturnValue(chain)

    const admin = (await import('@/lib/supabase/clients')).getAdminDb()
    const result = await promoteExistingIngestedSaleForDetailFirst(admin, {
      sourceUrl: 'https://example.com/listing.html',
      row: { status: 'ready' },
    })

    expect(result).toEqual({ id: 'sale-1' })
    expect(chain.update).toHaveBeenCalledWith({ status: 'ready' })
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
