import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({ from: mockFrom })),
  fromBase: (db: { from: typeof mockFrom }, table: string) => db.from(table),
}))

function makeDiscoveryChain(pages: Array<Array<{ city: string; state: string }>>) {
  let pageIndex = 0
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation(() => {
      const page = pages[pageIndex] ?? []
      pageIndex += 1
      return Promise.resolve({ data: page, error: null })
    }),
  }
  return chain
}

describe('discoverSeoMetrosFromPublishedSales pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('discovers Chicago when it appears after many sale rows', async () => {
    const filler = Array.from({ length: 1000 }, () => ({ city: 'Dallas', state: 'TX' }))
    const chicagoRows = [
      { city: 'Chicago', state: 'IL' },
      { city: 'Chicago', state: 'IL' },
    ]
    mockFrom.mockReturnValue(makeDiscoveryChain([filler, filler, chicagoRows]))

    const { discoverSeoMetrosFromPublishedSales } = await import('@/lib/seo/metroCatalog')
    const metros = await discoverSeoMetrosFromPublishedSales()

    expect(metros.map((metro) => metro.slug)).toContain('chicago-il')
    expect(metros.map((metro) => metro.slug)).toContain('dallas-tx')
  })

  it('paginates until a short final page', async () => {
    const pageOne = [{ city: 'Aurora', state: 'IL' }]
    const pageTwo = [{ city: 'Dixon', state: 'IL' }]
    mockFrom.mockReturnValue(makeDiscoveryChain([pageOne, pageTwo]))

    const { discoverSeoMetrosFromPublishedSales } = await import('@/lib/seo/metroCatalog')
    const metros = await discoverSeoMetrosFromPublishedSales()

    expect(metros.map((metro) => metro.slug).sort()).toEqual(['aurora-il', 'dixon-il'])
    const chain = mockFrom.mock.results[0]?.value
    expect(chain.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(chain.range).toHaveBeenCalledTimes(2)
  })
})
