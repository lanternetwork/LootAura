import { describe, it, expect } from 'vitest'
import { evaluateSeoMetroParticipation } from '@/lib/seo/metroParticipation'
import { TEST_SEO_METRO_DALLAS, TEST_SEO_METRO_AUSTIN } from './seoTestFixtures'

describe('evaluateSeoMetroParticipation', () => {
  it('marks metros participating only when operational gates and inventory pass', () => {
    const snapshot = evaluateSeoMetroParticipation({
      metros: [TEST_SEO_METRO_DALLAS, TEST_SEO_METRO_AUSTIN],
      nationalIndexingAllowed: true,
      inventoryBySlug: {
        'dallas-tx': {
          activeListingCount: 50,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
        'austin-tx': {
          activeListingCount: 5,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
      },
    })

    expect(snapshot.participatingMetroSlugs).toEqual(['dallas-tx'])
    const dallas = snapshot.rows.find((r) => r.slug === 'dallas-tx')
    const austin = snapshot.rows.find((r) => r.slug === 'austin-tx')
    expect(dallas?.qualified).toBe(true)
    expect(austin?.qualified).toBe(false)
    expect(austin?.reasons.some((r) => r.includes('below minimum'))).toBe(true)
  })

  it('excludes all metros when national gates have not passed', () => {
    const snapshot = evaluateSeoMetroParticipation({
      metros: [TEST_SEO_METRO_DALLAS],
      nationalIndexingAllowed: false,
      inventoryBySlug: {
        'dallas-tx': {
          activeListingCount: 50,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
      },
    })
    expect(snapshot.participatingMetroSlugs).toEqual([])
  })
})
