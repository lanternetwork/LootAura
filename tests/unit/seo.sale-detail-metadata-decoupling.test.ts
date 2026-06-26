import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetInventorySeoEmissionForRequest = vi.hoisted(() => vi.fn())
const mockLoadIngestedFlags = vi.hoisted(() => vi.fn())
const mockGetSaleWithItemsForRequest = vi.hoisted(() => vi.fn())
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn())

const saleDetailPageSourcePath = path.join(process.cwd(), 'app/sales/[id]/page.tsx')

vi.mock('@/lib/seo/resolveInventorySeoEmission', () => ({
  getInventorySeoEmissionForRequest: (...args: unknown[]) => mockGetInventorySeoEmissionForRequest(...args),
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
        external_source_url: 'https://www.yardsaletreasuremap.com/sale/abc123',
        lat: 38.25,
        lng: -85.76,
        ...overrides,
      },
      items: [],
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetInventorySeoEmissionForRequest.mockResolvedValue({
      seoEmissionAllowed: false,
      indexingAllowed: false,
      metricsAvailable: true,
      rollout: { seoEmissionAllowed: false, indexingAllowed: false, blockers: [] },
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

  it('uses shared inventory emission resolver for listing robots', async () => {
    const page = await import('@/app/sales/[id]/page')
    await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(mockGetInventorySeoEmissionForRequest).toHaveBeenCalledTimes(1)
  })

  it('keeps emission resolver and cohort eligibility in sale detail page source', () => {
    const source = readFileSync(saleDetailPageSourcePath, 'utf8')
    expect(source).toContain('getInventorySeoEmissionForRequest')
    expect(source).toContain('isSaleSeoIndexEligible')
    expect(source).toContain('loadIngestedEligibilityFlagsForPublishedSale')
  })

  it('returns noindex when emission resolver fails', async () => {
    mockGetInventorySeoEmissionForRequest.mockRejectedValueOnce(new Error('emission unavailable'))
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })

  it('returns noindex when national emission is blocked', async () => {
    mockGetInventorySeoEmissionForRequest.mockResolvedValueOnce({
      seoEmissionAllowed: false,
      indexingAllowed: false,
      metricsAvailable: true,
      rollout: { seoEmissionAllowed: false, indexingAllowed: false, blockers: [] },
    })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })

  it('can return index when emission is allowed and sale is cohort-eligible', async () => {
    mockGetInventorySeoEmissionForRequest.mockResolvedValueOnce({
      seoEmissionAllowed: true,
      indexingAllowed: true,
      metricsAvailable: true,
      rollout: { seoEmissionAllowed: true, indexingAllowed: true, blockers: [] },
    })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: true, follow: true })
  })

  it('returns noindex when sale fails cohort eligibility', async () => {
    mockGetInventorySeoEmissionForRequest.mockResolvedValueOnce({
      seoEmissionAllowed: true,
      indexingAllowed: true,
      metricsAvailable: true,
      rollout: { seoEmissionAllowed: true, indexingAllowed: true, blockers: [] },
    })
    setupSale({ status: 'draft', external_source_url: null, lat: null, lng: null })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
    expect(mockLoadIngestedFlags).not.toHaveBeenCalled()
  })
})
