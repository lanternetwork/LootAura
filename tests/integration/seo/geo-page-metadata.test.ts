import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

vi.mock('@/lib/seo/loadSeoRolloutState', () => ({
  getSeoMetrosForRequest: vi.fn(),
  getSeoRolloutStateForRequest: vi.fn(async () => ({
    publicIndexingEnabled: true,
    crawlValidationPassed: true,
    searchConsoleValidationPassed: true,
    publicIndexingEnabledAt: null,
    publicIndexingDisabledAt: null,
    crawlValidationPassedAt: null,
    searchConsoleValidationPassedAt: null,
  })),
  getSeoNationalIndexingAllowedForRequest: vi.fn(async () => true),
}))

vi.mock('@/lib/seo/fetchMetroInventory', () => ({
  fetchMetroInventory: vi.fn(async () => ({
    sales: [],
    summary: { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
  })),
}))

vi.mock('@/lib/seo/fetchMetroWeekendInventory', () => ({
  fetchMetroWeekendInventory: vi.fn(async () => ({
    sales: [],
    summary: { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
    weekend: { label: 'This Weekend', start: '2026-05-30', end: '2026-06-01' },
    freshnessBySaleId: {},
  })),
}))

describe('yard-sales metro page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns city page metadata when metro is in catalog', async () => {
    const { getSeoMetrosForRequest } = await import('@/lib/seo/loadSeoRolloutState')
    vi.mocked(getSeoMetrosForRequest).mockResolvedValue([TEST_SEO_METRO_DALLAS])

    const { generateMetadata } = await import('@/app/yard-sales/[metroSlug]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ metroSlug: 'dallas-tx' }) })

    expect(String(metadata.title)).toContain('Dallas')
  })

  it('returns fallback title when metro is missing from catalog', async () => {
    const { getSeoMetrosForRequest } = await import('@/lib/seo/loadSeoRolloutState')
    vi.mocked(getSeoMetrosForRequest).mockResolvedValue([])

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
    const { getSeoMetrosForRequest } = await import('@/lib/seo/loadSeoRolloutState')
    vi.mocked(getSeoMetrosForRequest).mockResolvedValue([TEST_SEO_METRO_DALLAS])

    const { generateMetadata } = await import('@/app/yard-sales-this-weekend/[metroSlug]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ metroSlug: 'dallas-tx' }) })

    expect(String(metadata.title)).toContain('Dallas')
  })
})
