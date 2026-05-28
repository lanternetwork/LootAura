import { describe, it, expect } from 'vitest'
import { getPilotMetroBySlug, SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'

describe('SEO pilot metros', () => {
  it('has 3–5 pilot metros', () => {
    expect(SEO_PILOT_METROS.length).toBeGreaterThanOrEqual(3)
    expect(SEO_PILOT_METROS.length).toBeLessThanOrEqual(5)
  })

  it('resolves slug', () => {
    expect(getPilotMetroBySlug('dallas-tx')?.city).toBe('Dallas')
    expect(getPilotMetroBySlug('invalid')).toBeUndefined()
  })
})
