import { describe, it, expect } from 'vitest'
import {
  buildCityPageH1,
  buildCityPageSupportingCopy,
  formatFreshnessLabel,
} from '@/lib/seo/copy/cityPageCopy'
import { TEST_SEO_METRO_DALLAS, TEST_SEO_METRO_PHOENIX } from './seoTestFixtures'

describe('cityPageCopy', () => {
  const metro = TEST_SEO_METRO_DALLAS
  const inventory = {
    activeListingCount: 42,
    lastUpdatedAt: '2026-05-28T12:00:00.000Z',
    crawlableInventoryPct: 0.9,
  }

  it('builds inventory-backed H1', () => {
    expect(buildCityPageH1(metro, inventory)).toContain('42')
    expect(buildCityPageH1(metro, inventory)).toContain('Dallas')
  })

  it('builds supporting copy with counts and freshness', () => {
    const copy = buildCityPageSupportingCopy({
      metro,
      inventory,
      nearbyMetros: [TEST_SEO_METRO_PHOENIX],
    })
    expect(copy).toContain('42')
    expect(copy).toContain('Dallas')
    expect(copy.length).toBeLessThan(2000)
  })

  it('formats freshness label', () => {
    expect(formatFreshnessLabel(null)).toContain('Updating')
    expect(formatFreshnessLabel(new Date().toISOString())).toContain('hour')
  })
})
