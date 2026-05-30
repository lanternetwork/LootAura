import { describe, it, expect } from 'vitest'
import {
  buildSitemapIndexXml,
  buildSitemapSegmentUrl,
} from '@/lib/seo/sitemap/buildSitemapIndexXml'

describe('buildSitemapIndexXml', () => {
  it('builds a valid sitemap index referencing segment URLs', () => {
    const xml = buildSitemapIndexXml([
      'https://lootaura.com/sitemap/static.xml',
      'https://lootaura.com/sitemap/listings-0.xml',
    ])

    expect(xml).toContain('<sitemapindex')
    expect(xml).toContain('<loc>https://lootaura.com/sitemap/static.xml</loc>')
    expect(xml).toContain('<loc>https://lootaura.com/sitemap/listings-0.xml</loc>')
  })

  it('escapes XML special characters in URLs', () => {
    const xml = buildSitemapIndexXml(['https://example.com/sitemap/a&amp;b.xml'])
    expect(xml).toContain('&amp;amp;')
  })

  it('builds segment URLs from base and id', () => {
    expect(buildSitemapSegmentUrl('https://lootaura.com/', 'cities')).toBe(
      'https://lootaura.com/sitemap/cities.xml'
    )
  })
})
