import { describe, it, expect, afterEach } from 'vitest'
import {
  getSeoActiveMetros,
  getSeoMetroCatalogForDashboard,
  isSeoMetroActive,
} from '@/lib/seo/metroCatalog'
import { SEO_ACTIVE_EXPANSION_METROS } from '@/lib/seo/expansionMetros'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'

describe('seo metro catalog', () => {
  afterEach(() => {
    SEO_ACTIVE_EXPANSION_METROS.length = 0
  })

  it('active metros default to pilot list only', () => {
    expect(getSeoActiveMetros().map((m) => m.slug)).toEqual(SEO_PILOT_METROS.map((m) => m.slug))
  })

  it('dashboard catalog includes pilot and expansion candidates', () => {
    const slugs = getSeoMetroCatalogForDashboard().map((m) => m.slug)
    expect(slugs).toContain('dallas-tx')
    expect(slugs).toContain('austin-tx')
  })

  it('code-promoted expansion metros become active', () => {
    SEO_ACTIVE_EXPANSION_METROS.push({
      slug: 'austin-tx',
      city: 'Austin',
      state: 'TX',
      timezone: 'America/Chicago',
      minActiveListings: 25,
    })
    expect(isSeoMetroActive('austin-tx')).toBe(true)
    expect(getSeoActiveMetros().map((m) => m.slug)).toContain('austin-tx')
  })
})
