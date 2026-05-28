import { describe, it, expect } from 'vitest'
import {
  getListingCanonicalPath,
  getListingCanonicalUrl,
  getCityPagePath,
  getWeekendPagePath,
} from '@/lib/seo/canonical'

describe('seo canonical paths', () => {
  it('uses sale id as listing identity', () => {
    expect(getListingCanonicalPath('abc-123')).toBe('/sales/abc-123')
    expect(getListingCanonicalUrl('abc-123')).toContain('/sales/abc-123')
  })

  it('uses single metro inventory surface paths', () => {
    expect(getCityPagePath('dallas-tx')).toBe('/yard-sales/dallas-tx')
    expect(getWeekendPagePath('dallas-tx')).toBe('/yard-sales-this-weekend/dallas-tx')
  })
})
