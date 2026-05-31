import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({ from: mockFrom })),
  fromBase: (db: { from: typeof mockFrom }, table: string) => db.from(table),
}))

describe('discoverSeoMetrosFromPublishedSales query target', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ city: 'Louisville', state: 'KY' }],
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)
  })

  it('queries lootaura_v2.sales with published city/state footprint', async () => {
    const { discoverSeoMetrosFromPublishedSales } = await import('@/lib/seo/metroCatalog')
    const metros = await discoverSeoMetrosFromPublishedSales()

    expect(mockFrom).toHaveBeenCalledWith('sales')
    const chain = mockFrom.mock.results[0]?.value
    expect(chain.eq).toHaveBeenCalledWith('status', 'published')
    expect(metros.map((m) => m.slug)).toContain('louisville-ky')
  })
})

describe('fetchMetroInventory query target', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })
  })

  it('queries lootaura_v2.sales for metro inventory', async () => {
    const { fetchMetroInventory } = await import('@/lib/seo/fetchMetroInventory')
    await fetchMetroInventory({
      slug: 'louisville-ky',
      city: 'Louisville',
      state: 'KY',
      timezone: 'America/New_York',
      minActiveListings: 25,
    })

    expect(mockFrom).toHaveBeenCalledWith('sales')
  })
})
