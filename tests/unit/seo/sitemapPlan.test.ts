import { describe, it, expect } from 'vitest'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import { SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutState'
import { enabledSeoRolloutState } from './seoRolloutTestHelpers'

describe('resolveSeoSitemapPlan', () => {
  it('returns static-only plan when rollout attestations are off', () => {
    const plan = resolveSeoSitemapPlan(5000, SEO_ROLLOUT_DISABLED_STATE)
    expect(plan.indexingEnabled).toBe(false)
    expect(plan.segmentIds).toEqual(['static'])
    expect(plan.listingChunkCount).toBe(0)
  })

  it('includes listing chunks and city/weekend when rollout ready', () => {
    const plan = resolveSeoSitemapPlan(2500, enabledSeoRolloutState())
    expect(plan.indexingEnabled).toBe(true)
    expect(plan.listingChunkCount).toBe(3)
    expect(plan.segmentIds[0]).toBe('static')
    expect(plan.segmentIds).toContain('cities')
    expect(plan.segmentIds).toContain('weekends')
  })
})
