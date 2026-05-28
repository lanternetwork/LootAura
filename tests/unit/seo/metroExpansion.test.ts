import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { evaluateSeoMetroExpansion } from '@/lib/seo/metroExpansion'

const originalEnv = process.env

describe('evaluateSeoMetroExpansion', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.SEO_EXPANSION_METRO_SLUGS
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('marks expansion candidates inactive until env activation', () => {
    const snapshot = evaluateSeoMetroExpansion({
      nationalIndexingAllowed: true,
      inventoryBySlug: {},
    })
    const austin = snapshot.rows.find((r) => r.slug === 'austin-tx')
    expect(austin?.tier).toBe('expansion_candidate')
    expect(austin?.pageActive).toBe(false)
  })

  it('marks env-activated expansion metros as active', () => {
    process.env.SEO_EXPANSION_METRO_SLUGS = 'austin-tx'
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
