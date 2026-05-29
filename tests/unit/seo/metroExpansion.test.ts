import { describe, it, expect, afterEach } from 'vitest'
import { evaluateSeoMetroExpansion } from '@/lib/seo/metroExpansion'
import { SEO_ACTIVE_EXPANSION_METROS } from '@/lib/seo/expansionMetros'

describe('evaluateSeoMetroExpansion', () => {
  afterEach(() => {
    SEO_ACTIVE_EXPANSION_METROS.length = 0
  })

  it('marks expansion candidates inactive until code promotion', () => {
    const snapshot = evaluateSeoMetroExpansion({
      nationalIndexingAllowed: true,
      inventoryBySlug: {},
    })
    const austin = snapshot.rows.find((r) => r.slug === 'austin-tx')
    expect(austin?.tier).toBe('expansion_candidate')
    expect(austin?.pageActive).toBe(false)
  })

  it('marks code-promoted expansion metros as active', () => {
    SEO_ACTIVE_EXPANSION_METROS.push({
      slug: 'austin-tx',
      city: 'Austin',
      state: 'TX',
      timezone: 'America/Chicago',
      minActiveListings: 25,
    })
    const snapshot = evaluateSeoMetroExpansion({
      nationalIndexingAllowed: true,
      inventoryBySlug: {
        'austin-tx': {
          activeListingCount: 40,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.9,
        },
      },
    })
    const austin = snapshot.rows.find((r) => r.slug === 'austin-tx')
    expect(austin?.tier).toBe('expansion_active')
    expect(austin?.pageActive).toBe(true)
    expect(austin?.qualified).toBe(true)
  })
})
