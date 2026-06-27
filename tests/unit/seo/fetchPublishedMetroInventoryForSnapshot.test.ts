import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_GEO_LOUISVILLE } from './metroGeographyTestFixtures'

const loadAllGeographyMock = vi.fn()
const rangeMock = vi.fn()
const ingestedSelectMock = vi.fn()

function buildSalesQueryChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const self = () => chain as unknown
  for (const method of ['select', 'eq', 'is', 'or', 'not', 'order']) {
    chain[method] = vi.fn(self)
  }
  chain.range = rangeMock
  return chain
}

const salesQueryChain = buildSalesQueryChain()

vi.mock('@/lib/seo/snapshots/loadSeoMetroGeography', () => ({
  loadAllSeoMetroGeography: (...args: unknown[]) => loadAllGeographyMock(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn((_admin: unknown, table: string) => {
    if (table === 'ingested_sales') {
      return { select: ingestedSelectMock }
    }
    return salesQueryChain
  }),
}))

const YSTM_LISTING_URL =
  'https://yardsaletreasuremap.com/US/KY/Louisville/123/listing.html'
const NON_YSTM_URL = 'https://www.estatesales.net/yard-sales/12345'

const basePublishedRow = {
  title: 'Estate Sale',
  updated_at: '2026-06-17T12:00:00.000Z',
  status: 'published',
  archived_at: null,
  moderation_status: 'approved',
  ends_at: '2026-06-20T23:59:59.000Z',
  lat: 38.25,
  lng: -85.76,
  city: 'Louisville',
  state: 'KY',
  date_start: '2026-06-17',
  date_end: '2026-06-20',
  address: '123 Main St',
  cover_image_url: null,
}

describe('resolveMetroInventoryCanonicalUrl', () => {
  it('uses external_source_url when present', async () => {
    const { resolveMetroInventoryCanonicalUrl } = await import(
      '@/lib/seo/sitemap/fetchPublishedListingRows'
    )
    expect(resolveMetroInventoryCanonicalUrl('sale-1', NON_YSTM_URL)).toBe(NON_YSTM_URL)
  })

  it('falls back to LootAura detail URL when external source is missing', async () => {
    const { resolveMetroInventoryCanonicalUrl } = await import(
      '@/lib/seo/sitemap/fetchPublishedListingRows'
    )
    expect(resolveMetroInventoryCanonicalUrl('sale-1', null)).toContain('/sales/sale-1')
  })
})

describe('fetchPublishedMetroInventoryForSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadAllGeographyMock.mockResolvedValue([TEST_GEO_LOUISVILLE])
    rangeMock.mockResolvedValue({ data: [], error: null })
    ingestedSelectMock.mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
  })

  it('includes non-YSTM published sales within metro radius', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [
        {
          id: 'non-ystm-sale',
          external_source_url: NON_YSTM_URL,
          ...basePublishedRow,
        },
      ],
      error: null,
    })

    const { fetchPublishedMetroInventoryForSnapshot } = await import(
      '@/lib/seo/sitemap/fetchPublishedListingRows'
    )
    const rows = await fetchPublishedMetroInventoryForSnapshot(new Date('2026-06-17T15:00:00.000Z'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.sale_id).toBe('non-ystm-sale')
    expect(rows[0]?.metro_slug).toBe('louisville-ky')
    expect(rows[0]?.canonical_url).toBe(NON_YSTM_URL)
  })

  it('does not dedupe duplicate canonical YSTM URLs for metro inventory', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [
        {
          id: 'ystm-sale-a',
          external_source_url: YSTM_LISTING_URL,
          ...basePublishedRow,
          title: 'Sale A',
        },
        {
          id: 'ystm-sale-b',
          external_source_url: YSTM_LISTING_URL,
          ...basePublishedRow,
          title: 'Sale B',
        },
      ],
      error: null,
    })

    const { fetchPublishedMetroInventoryForSnapshot } = await import(
      '@/lib/seo/sitemap/fetchPublishedListingRows'
    )
    const rows = await fetchPublishedMetroInventoryForSnapshot(new Date('2026-06-17T15:00:00.000Z'))

    expect(rows.map((row) => row.sale_id).sort()).toEqual(['ystm-sale-a', 'ystm-sale-b'])
  })

  it('excludes sales outside metro radius', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [
        {
          id: 'far-sale',
          external_source_url: NON_YSTM_URL,
          ...basePublishedRow,
          lat: 37.8092,
          lng: -85.4669,
          city: 'Bardstown',
        },
      ],
      error: null,
    })

    const { fetchPublishedMetroInventoryForSnapshot } = await import(
      '@/lib/seo/sitemap/fetchPublishedListingRows'
    )
    const rows = await fetchPublishedMetroInventoryForSnapshot(new Date('2026-06-17T15:00:00.000Z'))

    expect(rows).toHaveLength(0)
  })

  it('applies markers-style date_end filter in the query chain', async () => {
    const { fetchPublishedMetroInventoryForSnapshot } = await import(
      '@/lib/seo/sitemap/fetchPublishedListingRows'
    )
    await fetchPublishedMetroInventoryForSnapshot(new Date('2026-06-17T15:00:00.000Z'))

    expect(salesQueryChain.or).toHaveBeenCalledWith('date_end.is.null,date_end.gte.2026-06-17')
  })
})

describe('fetchPublishedListingRowsForSitemap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rangeMock.mockResolvedValue({ data: [], error: null })
    ingestedSelectMock.mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
  })

  it('still requires YSTM detail URLs for listing sitemap cohort', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [
        {
          id: 'non-ystm-sale',
          updated_at: '2026-06-17T12:00:00.000Z',
          status: 'published',
          archived_at: null,
          moderation_status: 'approved',
          ends_at: '2026-06-20T23:59:59.000Z',
          external_source_url: NON_YSTM_URL,
          lat: 38.25,
          lng: -85.76,
        },
      ],
      error: null,
    })

    const { fetchPublishedListingRowsForSitemap } = await import(
      '@/lib/seo/sitemap/fetchPublishedListingRows'
    )
    const rows = await fetchPublishedListingRowsForSitemap(new Date('2026-06-17T15:00:00.000Z'))

    expect(rows).toHaveLength(0)
  })
})
