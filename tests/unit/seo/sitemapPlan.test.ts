import { describe, it, expect } from 'vitest'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'

describe('resolveSeoSitemapPlan', () => {
  it('returns static-only plan when seo emission gate is false', () => {
    const plan = resolveSeoSitemapPlan(5000, {
      seoEmissionAllowed: false,
      indexingAllowed: false,
    })
    expect(plan.indexingEnabled).toBe(false)
    expect(plan.segmentIds).toEqual(['static'])
    expect(plan.listingChunkCount).toBe(0)
  })

  it('includes listing chunks when seo emission gate is true', () => {
    const plan = resolveSeoSitemapPlan(2500, {
      seoEmissionAllowed: true,
      indexingAllowed: false,
    })
    expect(plan.indexingEnabled).toBe(true)
    expect(plan.listingChunkCount).toBe(3)
    expect(plan.segmentIds[0]).toBe('static')
    expect(plan.segmentIds).not.toContain('cities')
    expect(plan.segmentIds).not.toContain('weekends')
  })

  it('includes city/weekend segments when indexing gate is true', () => {
    const plan = resolveSeoSitemapPlan(2500, {
      seoEmissionAllowed: true,
      indexingAllowed: true,
    })
    expect(plan.segmentIds).toContain('cities')
    expect(plan.segmentIds).toContain('weekends')
  })
})
