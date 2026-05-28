import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const originalEnv = process.env
import { buildMetroDistributionPack } from '@/lib/seo/distribution/buildMetroDistributionPack'
import { evaluateDistributionEligibility } from '@/lib/seo/distribution/evaluateDistributionEligibility'
import { buildSeoDistributionUrl } from '@/lib/seo/distribution/buildDistributionUrls'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'

describe('seo distribution pack', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_SITE_URL: 'https://lootaura.app' }
  })
  afterEach(() => {
    process.env = originalEnv
  })

  const metro = SEO_PILOT_METROS[0]
  const healthyInventory = {
    activeListingCount: 40,
    lastUpdatedAt: new Date().toISOString(),
    crawlableInventoryPct: 0.9,
  }

  it('builds UTM-tagged distribution URLs on site origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lootaura.app'
    const url = buildSeoDistributionUrl('/yard-sales/dallas-tx', 'reddit_city')
    expect(url).toContain('https://lootaura.app/yard-sales/dallas-tx')
    expect(url).toContain('utm_source=local_discovery')
    expect(url).toContain('utm_campaign=seo_reddit_city')
  })

  it('blocks distribution when national allowlist has not passed', () => {
    const result = evaluateDistributionEligibility({
      metro,
      inventory: healthyInventory,
      nationalIndexingAllowed: false,
    })
    expect(result.eligible).toBe(false)
    expect(result.blockers.some((b) => b.includes('National SEO'))).toBe(true)
  })

  it('builds eligible reddit city pack when gates pass', () => {
    const pack = buildMetroDistributionPack({
      metro,
      surface: 'reddit_city',
      inventory: healthyInventory,
      nationalIndexingAllowed: true,
      sampleSales: [{ title: 'Estate sale on Oak St', city: metro.city, state: metro.state }],
    })
    expect(pack.eligible).toBe(true)
    expect(pack.body).toContain('Human-reviewed')
    expect(pack.links.length).toBe(2)
  })
})
