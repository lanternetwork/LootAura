import { describe, it, expect } from 'vitest'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'

describe('resolveSeoSitemapPlan', () => {
  it('returns static-only plan when inventory emission gate R is false', () => {
    const plan = resolveSeoSitemapPlan(5000, false)
    expect(plan.indexingEnabled).toBe(false)
    expect(plan.segmentIds).toEqual(['static'])
    expect(plan.listingChunkCount).toBe(0)
  })

  it('includes listing chunks and city/weekend when inventory emission gate R is true', () => {
    const plan = resolveSeoSitemapPlan(2500, true)
    expect(plan.indexingEnabled).toBe(true)
    expect(plan.listingChunkCount).toBe(3)
    expect(plan.segmentIds[0]).toBe('static')
    expect(plan.segmentIds).toContain('cities')
    expect(plan.segmentIds).toContain('weekends')
  })
})
