import { describe, it, expect } from 'vitest'
import { createCityPageMetadata, createWeekendPageMetadata } from '@/lib/seo/metadata'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'

describe('seo metadata', () => {
  const metro = SEO_PILOT_METROS[0]
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
