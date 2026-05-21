import { describe, expect, it } from 'vitest'
import { extractYstmListingUrlsFromListHtml } from '@/lib/ingestion/ystmCoverage/extractYstmListingUrlsFromListHtml'

describe('extractYstmListingUrlsFromListHtml', () => {
  it('extracts absolute and relative YSTM detail links', () => {
    const html = `
      <a href="/US/Illinois/Springfield/123-main-st/listing.html">Sale A</a>
      <a href="https://yardsaletreasuremap.com/US/Illinois/Springfield/456-oak/userlisting.html">Sale B</a>
      <a href="https://example.com/other.html">Ignore</a>
    `
    const urls = extractYstmListingUrlsFromListHtml(
      html,
      'https://yardsaletreasuremap.com/US/Illinois/Springfield/'
    )
    expect(urls).toHaveLength(2)
    expect(urls[0]?.canonicalUrl).toContain('listing.html')
    expect(urls[1]?.canonicalUrl).toContain('userlisting.html')
  })

  it('dedupes by canonical URL', () => {
    const html = `
      <a href="/US/Texas/Austin/1/listing.html">A</a>
      <a href="https://yardsaletreasuremap.com/US/Texas/Austin/1/listing.html">A dup</a>
    `
    const urls = extractYstmListingUrlsFromListHtml(html, 'https://yardsaletreasuremap.com/US/Texas/Austin/')
    expect(urls).toHaveLength(1)
  })
})
