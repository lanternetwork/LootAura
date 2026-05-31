import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

vi.mock('@/lib/seo/fetchAllSeoMetroInventory', () => ({
  fetchNationwideSeoMetroInventory: vi.fn(),
}))

describe('GET /api/admin/seo/metro-inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns metros and inventory when admin authorized', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { fetchNationwideSeoMetroInventory } = await import('@/lib/seo/fetchAllSeoMetroInventory')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    vi.mocked(fetchNationwideSeoMetroInventory).mockResolvedValue({
      metros: [TEST_SEO_METRO_DALLAS],
      inventoryBySlug: {
        'dallas-tx': { activeListingCount: 30, lastUpdatedAt: '2026-05-30T00:00:00.000Z', crawlableInventoryPct: 1 },
      },
    })

    const { GET } = await import('@/app/api/admin/seo/metro-inventory/route')
    const response = await GET(new NextRequest('http://localhost/api/admin/seo/metro-inventory'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.metros).toHaveLength(1)
    expect(body.metros[0].slug).toBe('dallas-tx')
  })

  it('returns 403 when admin gate rejects', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { NextResponse } = await import('next/server')
    vi.mocked(assertAdminOrThrow).mockRejectedValue(
      NextResponse.json({ ok: false }, { status: 403 })
    )

    const { GET } = await import('@/app/api/admin/seo/metro-inventory/route')
    const response = await GET(new NextRequest('http://localhost/api/admin/seo/metro-inventory'))

    expect(response.status).toBe(403)
  })
})
