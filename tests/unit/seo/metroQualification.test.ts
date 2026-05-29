import { describe, it, expect } from 'vitest'
import { qualifyMetroForSeoRollout } from '@/lib/seo/metroQualification'
import { TEST_SEO_METRO_DALLAS } from './seoTestFixtures'

describe('qualifyMetroForSeoRollout', () => {
  const metro = TEST_SEO_METRO_DALLAS

  it('fails when national allowlist has not passed', () => {
    const result = qualifyMetroForSeoRollout({
      metro,
      nationalIndexingAllowed: false,
      inventory: {
        activeListingCount: 100,
        lastUpdatedAt: new Date().toISOString(),
        crawlableInventoryPct: 0.95,
      },
    })
    expect(result.qualified).toBe(false)
    expect(result.reasons.some((r) => r.includes('National'))).toBe(true)
  })

  it('passes with healthy inventory and national allowlist', () => {
    const result = qualifyMetroForSeoRollout({
      metro,
      nationalIndexingAllowed: true,
      inventory: {
        activeListingCount: 100,
        lastUpdatedAt: new Date().toISOString(),
        crawlableInventoryPct: 0.95,
      },
    })
    expect(result.qualified).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(90)
  })
})
