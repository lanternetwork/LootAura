import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

vi.mock('@/lib/admin/social/buildSocialCityReport', () => ({
  buildSocialCityReport: vi.fn(),
  SocialCityReportError: class SocialCityReportError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number
    ) {
      super(message)
      this.name = 'SocialCityReportError'
    }
  },
}))

describe('GET /api/admin/social/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns report when admin authorized', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { buildSocialCityReport } = await import('@/lib/admin/social/buildSocialCityReport')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    vi.mocked(buildSocialCityReport).mockResolvedValue({
      city: TEST_SEO_METRO_DALLAS.city,
      state: TEST_SEO_METRO_DALLAS.state,
      citySlug: TEST_SEO_METRO_DALLAS.slug,
      activeSales: 42,
      cityRank: 3,
      updatedAt: '2026-06-07T13:00:00.000Z',
      weekendStart: '2026-06-13',
      weekendEnd: '2026-06-14',
      weekendLabel: 'This Weekend',
      heroDateRange: 'June 13–14, 2026',
      timestampLabel: 'June 7, 2026\n8:00 AM CDT',
      caption: 'Dallas caption',
      mapPins: [],
      mapViewport: {
        centerLat: 32.7767,
        centerLng: -96.797,
        zoom: 9,
      },
    })

    const { GET } = await import('@/app/api/admin/social/report/route')
    const response = await GET(
      new NextRequest('http://localhost/api/admin/social/report?citySlug=dallas-tx')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.report.citySlug).toBe('dallas-tx')
    expect(body.report.activeSales).toBe(42)
  })

  it('returns 400 when citySlug missing', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1' } })

    const { GET } = await import('@/app/api/admin/social/report/route')
    const response = await GET(new NextRequest('http://localhost/api/admin/social/report'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('CITY_SLUG_REQUIRED')
  })

  it('returns 403 when admin gate rejects', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { NextResponse } = await import('next/server')
    vi.mocked(assertAdminOrThrow).mockRejectedValue(
      NextResponse.json({ ok: false }, { status: 403 })
    )

    const { GET } = await import('@/app/api/admin/social/report/route')
    const response = await GET(
      new NextRequest('http://localhost/api/admin/social/report?citySlug=dallas-tx')
    )

    expect(response.status).toBe(403)
  })
})
