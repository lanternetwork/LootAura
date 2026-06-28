import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SEO_SNAPSHOT_MAX_AGE_MS } from '@/lib/seo/snapshots/constants'

const fromBaseMock = vi.fn()
const getAdminDbMock = vi.fn(() => ({}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => getAdminDbMock(),
  fromBase: (...args: unknown[]) => fromBaseMock(...args),
}))

function chainMock(resolved: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}
  const terminal = () => Promise.resolve(resolved)
  for (const method of ['select', 'eq', 'order', 'limit', 'maybeSingle', 'neq']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = terminal
  chain.limit = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  ;(chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(resolved).then(resolve)
  return chain
}

describe('loadMetroInventoryFromSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fail-closed when metro inventory snapshot is stale', async () => {
    const staleUpdatedAt = new Date(Date.now() - SEO_SNAPSHOT_MAX_AGE_MS - 60_000).toISOString()
    fromBaseMock.mockImplementation(() =>
      chainMock({ data: { updated_at: staleUpdatedAt }, error: null })
    )

    const { loadMetroInventoryFromSnapshot } = await import('@/lib/seo/snapshots/loadSeoMetroInventory')
    const result = await loadMetroInventoryFromSnapshot('louisville-ky')

    expect(result.sales).toEqual([])
    expect(result.summary.activeListingCount).toBe(0)
  })

  it('maps snapshot display fields onto Sale objects', async () => {
    const freshUpdatedAt = new Date().toISOString()
    let call = 0
    fromBaseMock.mockImplementation(() => {
      call += 1
      if (call === 1) {
        return chainMock({ data: { updated_at: freshUpdatedAt }, error: null })
      }
      if (call === 2) {
        return chainMock({
          data: { inventory_limit: 250 },
          error: null,
        })
      }
      return chainMock({
        data: [
          {
            metro_slug: 'louisville-ky',
            sale_id: 'sale-1',
            canonical_url: 'https://lootaura.app/sales/sale-1',
            title: 'Garage Sale',
            city: 'Louisville',
            state: 'KY',
            starts_at: '2026-06-20',
            ends_at: '2026-06-21',
            latitude: 38.25,
            longitude: -85.75,
            updated_at: freshUpdatedAt,
            cover_image_url: 'https://cdn.example/cover.jpg',
            address: '123 Main St',
          },
        ],
        error: null,
      })
    })

    const { loadMetroInventoryFromSnapshot } = await import('@/lib/seo/snapshots/loadSeoMetroInventory')
    const result = await loadMetroInventoryFromSnapshot('louisville-ky')

    expect(result.sales[0]?.cover_image_url).toBe('https://cdn.example/cover.jpg')
    expect(result.sales[0]?.address).toBe('123 Main St')
  })
})
