import { describe, it, expect } from 'vitest'
import { TEST_SEO_METRO_DALLAS } from './seoTestFixtures'
import {
  buildMetroFaqItems,
  buildMetroHeroSubtitle,
  buildMetroHelpfulContentParagraphs,
} from '@/lib/seo/copy/metroPageCopy'

describe('metroPageCopy', () => {
  it('builds hero subtitle with radius copy', () => {
    expect(
      buildMetroHeroSubtitle({
        activeListingCount: 41,
        radiusMiles: 25,
        city: 'Chicago',
      })
    ).toBe('41 active yard sales within 25 miles of downtown Chicago')
  })

  it('builds weekend hero subtitle', () => {
    expect(
      buildMetroHeroSubtitle({
        activeListingCount: 12,
        radiusMiles: 25,
        city: 'Louisville',
        weekend: true,
      })
    ).toBe('12 active yard sales this weekend within 25 miles of downtown Louisville')
  })

  it('builds helpful content and FAQ without AI placeholders', () => {
    const paragraphs = buildMetroHelpfulContentParagraphs({
      metro: TEST_SEO_METRO_DALLAS,
      radiusMiles: 25,
      interactiveMapHref: '/sales?city=Dallas',
    })
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
    expect(paragraphs.join(' ')).toContain('hourly')

    const faq = buildMetroFaqItems({ metro: TEST_SEO_METRO_DALLAS, radiusMiles: 25 })
    expect(faq.map((item) => item.question)).toContain('How do I list my own sale?')
  })
})
