import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import { countListingSitemapChunks } from '@/lib/seo/sitemap/listingEntries'

const originalEnv = process.env

describe('seo sitemap plan', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, SEO_PUBLIC_INDEXING_ENABLED: 'false' }
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('static segment never includes query URLs', () => {
    const entries = buildStaticSitemapEntries()
    for (const entry of entries) {
      expect(entry.url).not.toContain('?')
      expect(entry.url).not.toContain('tab=map')
    }
  })

  it('includes only static segment when indexing disabled', () => {
    const plan = resolveSeoSitemapPlan(5000)
    expect(plan.indexingEnabled).toBe(false)
    expect(plan.segmentIds).toEqual(['static'])
    expect(plan.listingChunkCount).toBe(0)
  })

  it('chunks listings when indexing enabled', () => {
    process.env.SEO_PUBLIC_INDEXING_ENABLED = 'true'
    const plan = resolveSeoSitemapPlan(2500)
    expect(plan.indexingEnabled).toBe(true)
    expect(plan.listingChunkCount).toBe(countListingSitemapChunks(2500))
    expect(plan.segmentIds[0]).toBe('static')
    expect(plan.segmentIds).toContain('listings-0')
    expect(plan.segmentIds).toContain('listings-2')
  })
})
