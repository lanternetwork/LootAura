import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

vi.mock('@/lib/seo/metroCatalog', () => ({
  discoverSeoMetrosFromPublishedSales: vi.fn(),
}))

describe('GET /api/admin/social/metros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns preset metros when discovery is empty', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { discoverSeoMetrosFromPublishedSales } = await import('@/lib/seo/metroCatalog')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    vi.mocked(discoverSeoMetrosFromPublishedSales).mockResolvedValue([])

    const { GET } = await import('@/app/api/admin/social/metros/route')
    const response = await GET(new NextRequest('http://localhost/api/admin/social/metros'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.metros.map((metro: { slug: string }) => metro.slug)).toEqual(
      listSocialReportRankingPresetSlugs()
    )
    expect(body.metros.map((metro: { slug: string }) => metro.slug)).toContain('chicago-il')
  })

  it('returns preset metros first and dedupes discovered overlaps', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { discoverSeoMetrosFromPublishedSales } = await import('@/lib/seo/metroCatalog')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    vi.mocked(discoverSeoMetrosFromPublishedSales).mockResolvedValue([TEST_SEO_METRO_DALLAS])

    const { GET } = await import('@/app/api/admin/social/metros/route')
    const response = await GET(new NextRequest('http://localhost/api/admin/social/metros'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.metros[0].slug).toBe('chicago-il')
    expect(body.metros.filter((metro: { slug: string }) => metro.slug === 'dallas-tx')).toHaveLength(1)
    expect(body.metros.find((metro: { slug: string }) => metro.slug === 'dallas-tx')?.label).toBe(
      'Dallas, TX'
    )
  })
})
