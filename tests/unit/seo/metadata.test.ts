import { describe, it, expect } from 'vitest'
import { createCityPageMetadata, createWeekendPageMetadata } from '@/lib/seo/metadata'
import { TEST_SEO_METRO_DALLAS } from './seoTestFixtures'

describe('seo metadata', () => {
  const metro = TEST_SEO_METRO_DALLAS
  const inventory = {
    activeListingCount: 42,
    lastUpdatedAt: '2026-05-28T12:00:00.000Z',
    crawlableInventoryPct: 0.9,
  }

  it('defaults city pages to noindex', () => {
    const meta = createCityPageMetadata({ metro, inventory })
    expect(meta.robots).toMatchObject({ index: false, follow: true })
    expect(meta.alternates?.canonical).toContain('/yard-sales/dallas-tx')
  })

  it('defaults weekend pages to noindex', () => {
    const meta = createWeekendPageMetadata({ metro, inventory, weekendLabel: 'This Weekend' })
    expect(meta.robots).toMatchObject({ index: false, follow: true })
    expect(meta.alternates?.canonical).toContain('/yard-sales-this-weekend/dallas-tx')
  })
})
