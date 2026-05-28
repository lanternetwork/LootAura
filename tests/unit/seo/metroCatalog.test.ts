import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getSeoActiveMetros,
  getSeoMetroBySlug,
  isSeoMetroActive,
} from '@/lib/seo/metroCatalog'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'

const originalEnv = process.env

describe('seo metro catalog', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.SEO_EXPANSION_METRO_SLUGS
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('includes only pilots when expansion env unset', () => {
    expect(getSeoActiveMetros().map((m) => m.slug)).toEqual(SEO_PILOT_METROS.map((m) => m.slug))
    expect(isSeoMetroActive('austin-tx')).toBe(false)
  })

  it('activates expansion metros from env', () => {
    process.env.SEO_EXPANSION_METRO_SLUGS = 'austin-tx,charlotte-nc'
    const slugs = getSeoActiveMetros().map((m) => m.slug)
    expect(slugs).toContain('austin-tx')
    expect(slugs).toContain('charlotte-nc')
    expect(isSeoMetroActive('austin-tx')).toBe(true)
    expect(getSeoMetroBySlug('austin-tx')?.city).toBe('Austin')
  })
})
