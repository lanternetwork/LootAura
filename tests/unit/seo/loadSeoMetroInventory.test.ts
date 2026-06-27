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
})
