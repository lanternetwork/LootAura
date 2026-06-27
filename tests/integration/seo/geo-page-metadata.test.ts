import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

const loadMetroPageContextMock = vi.fn()

vi.mock('@/lib/seo/snapshots/loadMetroPageContext', () => ({
  loadMetroPageContext: (...args: unknown[]) => loadMetroPageContextMock(...args),
}))

describe('yard-sales metro page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns city page metadata when metro is in catalog', async () => {
    loadMetroPageContextMock.mockResolvedValue({
      metro: TEST_SEO_METRO_DALLAS,
      metroQualified: true,
      gate: { seoEmissionAllowed: true, indexingAllowed: true, snapshotFresh: true, qualifiedMetroCount: 1 },
      inventory: {
        sales: [],
        summary: { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
      },
      nearbyMetros: [],
    })

    const { generateMetadata } = await import('@/app/yard-sales/[metroSlug]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ metroSlug: 'dallas-tx' }) })

    expect(String(metadata.title)).toContain('Dallas')
    expect(loadMetroPageContextMock).toHaveBeenCalledWith('dallas-tx')
  })

  it('returns fallback title when metro is missing from catalog', async () => {
    loadMetroPageContextMock.mockResolvedValue(null)

    const { generateMetadata } = await import('@/app/yard-sales/[metroSlug]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ metroSlug: 'unknown-zz' }) })

    expect(metadata.title).toBe('Yard sales · Loot Aura')
  })
})

describe('yard-sales-this-weekend metro page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns weekend page metadata when metro is in catalog', async () => {
    loadMetroPageContextMock.mockResolvedValue({
      metro: TEST_SEO_METRO_DALLAS,
      metroQualified: true,
      gate: { seoEmissionAllowed: true, indexingAllowed: true, snapshotFresh: true, qualifiedMetroCount: 1 },
      inventory: {
        sales: [],
        summary: { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
      },
      nearbyMetros: [],
    })

    const { generateMetadata } = await import('@/app/yard-sales-this-weekend/[metroSlug]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ metroSlug: 'dallas-tx' }) })

    expect(String(metadata.title)).toContain('Dallas')
    expect(loadMetroPageContextMock).toHaveBeenCalledWith('dallas-tx')
  })
})
