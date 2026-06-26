import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResolveSitemapSeoGate = vi.hoisted(() => vi.fn())
const mockLoadIngestedFlags = vi.hoisted(() => vi.fn())
const mockGetSaleWithItemsForRequest = vi.hoisted(() => vi.fn())
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn())

const saleDetailPageSourcePath = path.join(process.cwd(), 'app/sales/[id]/page.tsx')

vi.mock('@/lib/seo/resolveSitemapSeoGate', () => ({
  resolveSitemapSeoGate: (...args: unknown[]) => mockResolveSitemapSeoGate(...args),
}))

vi.mock('@/lib/seo/sitemap/fetchPublishedListingRows', () => ({
  loadIngestedEligibilityFlagsForPublishedSale: (...args: unknown[]) => mockLoadIngestedFlags(...args),
}))

vi.mock('@/lib/data/saleDetailLoader', () => ({
  getSaleWithItemsForRequest: (...args: unknown[]) => mockGetSaleWithItemsForRequest(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) => mockCreateSupabaseServerClient(...args),
}))

describe('sale detail metadata SEO emission', () => {
  function setupSale(overrides: Record<string, unknown> = {}) {
    mockGetSaleWithItemsForRequest.mockResolvedValue({
      sale: {
        id: 'sale-1',
        owner_id: 'owner-1',
        title: 'Test Sale',
        city: 'Louisville',
        state: 'KY',
        date_start: '2026-06-01',
        time_start: '09:00',
        status: 'published',
        privacy_mode: 'exact',
        is_featured: false,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
        moderation_status: 'approved',
        archived_at: null,
        external_source_url: 'https://yardsaletreasuremap.com/US/KY/Louisville/1/listing.html',
        lat: 38.25,
        lng: -85.76,
        ...overrides,
      },
      items: [],
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveSitemapSeoGate.mockResolvedValue({
      seoEmissionAllowed: false,
      indexingAllowed: false,
      snapshotFresh: false,
      qualifiedMetroCount: 0,
    })
    mockLoadIngestedFlags.mockResolvedValue({
      ingestedIsDuplicate: false,
      ingestedSuperseded: false,
    })
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })
    setupSale()
  })

  it('uses shared sitemap SEO gate for listing robots', async () => {
    const page = await import('@/app/sales/[id]/page')
    await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(mockResolveSitemapSeoGate).toHaveBeenCalledTimes(1)
  })

  it('keeps sitemap SEO gate and cohort eligibility in sale detail page source', () => {
    const source = readFileSync(saleDetailPageSourcePath, 'utf8')
    expect(source).toContain('resolveSitemapSeoGate')
    expect(source).toContain('isSaleSeoIndexEligible')
    expect(source).toContain('loadIngestedEligibilityFlagsForPublishedSale')
  })

  it('returns noindex when sitemap SEO gate fails', async () => {
    mockResolveSitemapSeoGate.mockRejectedValueOnce(new Error('gate unavailable'))
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })

  it('returns noindex when sitemap SEO gate blocks emission', async () => {
    mockResolveSitemapSeoGate.mockResolvedValueOnce({
      seoEmissionAllowed: false,
      indexingAllowed: false,
      snapshotFresh: false,
      qualifiedMetroCount: 0,
    })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })

  it('can return index when sitemap gate allows emission and sale is cohort-eligible', async () => {
    mockResolveSitemapSeoGate.mockResolvedValueOnce({
      seoEmissionAllowed: true,
      indexingAllowed: true,
      snapshotFresh: true,
      qualifiedMetroCount: 3,
    })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: true, follow: true })
  })

  it('returns noindex when sale fails cohort eligibility', async () => {
    mockResolveSitemapSeoGate.mockResolvedValueOnce({
      seoEmissionAllowed: true,
      indexingAllowed: true,
      snapshotFresh: true,
      qualifiedMetroCount: 3,
    })
    setupSale({ status: 'draft', external_source_url: null, lat: null, lng: null })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
    expect(mockLoadIngestedFlags).not.toHaveBeenCalled()
  })
})
