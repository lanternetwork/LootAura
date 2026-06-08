import { describe, it, expect } from 'vitest'
import { buildSocialCityReportCaption } from '@/lib/admin/social/buildSocialCityReportCaption'

describe('buildSocialCityReportCaption', () => {
  it('uses city/state location and rank for preset cities', () => {
    const caption = buildSocialCityReportCaption({
      city: 'Dallas',
      state: 'TX',
      cityRank: 3,
      activeSales: 472,
    })

    expect(caption).toContain('Dallas, TX')
    expect(caption).toContain('#3 most active city this weekend')
    expect(caption).toContain('472 active sales')
    expect(caption).toContain('ranked metros')
  })

  it('omits rank line for non-preset cities', () => {
    const caption = buildSocialCityReportCaption({
      city: 'Springfield',
      state: 'IL',
      cityRank: null,
      activeSales: 12,
    })

    expect(caption).toContain('Springfield, IL')
    expect(caption).toContain('12 active sales')
    expect(caption).not.toContain('most active city')
  })
})
