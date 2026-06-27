import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'
import { TEST_SOCIAL_PRESET_GEOGRAPHY } from '../../unit/seo/metroGeographyTestFixtures'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

const mockAssertAdmin = vi.hoisted(() => vi.fn())
const mockDiscoverMetros = vi.hoisted(() => vi.fn())
const mockLoadAllGeography = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: unknown[]) => mockAssertAdmin(...args),
}))

vi.mock('@/lib/seo/metroCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo/metroCatalog')>()
  return {
    ...actual,
    discoverSeoMetrosFromPublishedSales: (...args: unknown[]) => mockDiscoverMetros(...args),
  }
})

vi.mock('@/lib/seo/snapshots/loadSeoMetroGeography', () => ({
  loadAllSeoMetroGeography: (...args: unknown[]) => mockLoadAllGeography(...args),
}))

describe('GET /api/admin/social/metros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertAdmin.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    mockDiscoverMetros.mockResolvedValue([])
    mockLoadAllGeography.mockResolvedValue(TEST_SOCIAL_PRESET_GEOGRAPHY)
  })

  it('returns preset metros when discovery is empty', async () => {
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
    mockDiscoverMetros.mockResolvedValue([TEST_SEO_METRO_DALLAS])

    const { GET } = await import('@/app/api/admin/social/metros/route')
    const response = await GET(new NextRequest('http://localhost/api/admin/social/metros'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.metros[0].slug).toBe('chicago-il')
    expect(body.metros.filter((metro: { slug: string }) => metro.slug === 'dallas-tx')).toHaveLength(
      1
    )
    expect(body.metros.find((metro: { slug: string }) => metro.slug === 'dallas-tx')?.label).toBe(
      'Dallas, TX'
    )
  })
})
