import { describe, it, expect } from 'vitest'

describe('normalizeSourcePages', () => {
  it('returns only valid http(s) URLs from array', async () => {
    const { normalizeSourcePages } = await import('@/lib/ingestion/adapters/externalPageSource')
    const out = normalizeSourcePages([
      'https://example.com/a',
      'ftp://bad',
      'not-a-url',
      '  https://example.com/b  ',
    ])
    expect(out).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('returns empty for non-array or empty', async () => {
    const { normalizeSourcePages } = await import('@/lib/ingestion/adapters/externalPageSource')
    expect(normalizeSourcePages(null)).toEqual([])
    expect(normalizeSourcePages([])).toEqual([])
  })
})

describe('parseExternalPageSourceHtml', () => {
  const LIST = 'https://example.com/list'

  it('uses USPS state to match /US/{StateSegment}/ listing paths', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://example.com/US/Illinois/Chicago/3805-N-Sacramento-Ave/161028326/listing.html">Sale A</a>
    `
    const { listings, invalid } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(invalid).toBe(0)
    expect(listings).toHaveLength(1)
    expect(listings[0].city).toBe('Chicago')
    expect(listings[0].state).toBe('IL')
    expect(listings[0].title).toContain('Sale A')
    expect(listings[0].addressRaw).toBe('3805 N Sacramento Ave')
    expect(listings[0].rawPayload.adapter).toBe('external_page_source')
  })

  it('matches Kentucky when state is KY', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://example.com/US/Kentucky/Louisville/100-Main-St/42/listing.html">Louisville sale</a>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Louisville', state: 'KY', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].city).toBe('Louisville')
    expect(listings[0].state).toBe('KY')
  })

  it('returns no listings when state segment cannot be resolved', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `<a href="https://example.com/US/Illinois/Chicago/x/1/listing.html">x</a>`
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'X', state: 'ZZ', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(0)
  })

  it('dedupes identical hrefs', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://example.com/US/Illinois/Chicago/1-A/99/listing.html">One</a>
      <a href="https://example.com/US/Illinois/Chicago/1-A/99/listing.html">Dup</a>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
  })
})
