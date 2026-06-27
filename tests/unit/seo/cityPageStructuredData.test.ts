import { describe, it, expect } from 'vitest'
import { createCityPageStructuredDataBundle } from '@/lib/seo/structuredData'
import { TEST_SEO_METRO_DALLAS } from './seoTestFixtures'

describe('createCityPageStructuredDataBundle', () => {
  it('omits ItemList when inventory is empty', () => {
    const blocks = createCityPageStructuredDataBundle({
      metro: TEST_SEO_METRO_DALLAS,
      inventory: { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
      items: [],
      includeInventoryList: false,
    })

    const types = blocks.map((block) => block['@type'])
    expect(types).toContain('Place')
    expect(types).toContain('BreadcrumbList')
    expect(types).not.toContain('ItemList')
  })
})
