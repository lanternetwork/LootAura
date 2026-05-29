import { describe, it, expect } from 'vitest'
import {
  buildMetroSlug,
  getNearbyMetros,
  getSeoMetroBySlug,
  resolveSeoMetroForSale,
} from '@/lib/seo/metroCatalog'
import { TEST_SEO_METRO_DALLAS, TEST_SEO_METRO_AUSTIN, TEST_SEO_METRO_PHOENIX } from './seoTestFixtures'

describe('metroCatalog', () => {
  const metros = [TEST_SEO_METRO_DALLAS, TEST_SEO_METRO_AUSTIN, TEST_SEO_METRO_PHOENIX]

  it('builds stable slugs from city and state', () => {
    expect(buildMetroSlug('Dallas', 'TX')).toBe('dallas-tx')
    expect(buildMetroSlug('St. Paul', 'MN')).toBe('st-paul-mn')
  })

  it('resolves metros by slug from catalog', () => {
    expect(getSeoMetroBySlug(metros, 'dallas-tx')).toEqual(TEST_SEO_METRO_DALLAS)
    expect(getSeoMetroBySlug(metros, 'unknown-zz')).toBeUndefined()
  })

  it('resolves metro identity from sale city/state without allowlist', () => {
    expect(resolveSeoMetroForSale({ city: 'Dallas', state: 'TX' })?.slug).toBe('dallas-tx')
    expect(resolveSeoMetroForSale({ city: 'Dallas', state: 'TX' }, metros)?.slug).toBe('dallas-tx')
    expect(resolveSeoMetroForSale({ city: '', state: 'TX' })).toBeNull()
  })

  it('prefers nearby metros in the same state', () => {
    const nearby = getNearbyMetros(TEST_SEO_METRO_DALLAS, metros, 1)
    expect(nearby.map((m) => m.slug)).toEqual(['austin-tx'])
  })
})
