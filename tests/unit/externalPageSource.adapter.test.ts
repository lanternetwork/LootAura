import { describe, it, expect } from 'vitest'

describe('normalizeSourcePages', () => {
  it('returns only valid HTTPS URLs from array', async () => {
    const { normalizeSourcePages } = await import('@/lib/ingestion/adapters/externalPageSource')
    const out = normalizeSourcePages([
      'https://example.com/a',
      'http://example.com/insecure',
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

  it('extracts image candidates as normalized HTTPS with max 3 and sets imageSourceUrl', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <meta property="og:image" content="/images/og-photo.jpg" />
      <a href="https://example.com/US/Illinois/Chicago/1-A/99/listing.html">One</a>
      <div>
        <img src="https://cdn.example.com/a.jpg" />
        <img src="/gallery/b.jpg" />
        <img src="http://cdn.example.com/insecure.jpg" />
        <img src="https://cdn.example.com/a.jpg" />
        <img src="https://cdn.example.com/c.jpg" />
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].rawPayload.imageUrls).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://example.com/gallery/b.jpg',
      'https://cdn.example.com/c.jpg',
    ])
    expect(listings[0].imageSourceUrl).toBe('https://cdn.example.com/a.jpg')
  })

  it('extracts lazy image attributes and srcset near listing anchors', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://example.com/US/Illinois/Chicago/1-A/199/listing.html">Lazy sale</a>
      <div class="content">
        <img data-src="/images/lazy-a.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
        <img srcset="https://cdn.example.com/lazy-b.webp 2x, https://cdn.example.com/lazy-b-small.webp 1x" />
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].rawPayload.imageUrls).toEqual([
      'https://example.com/images/lazy-a.jpg',
      'https://cdn.example.com/lazy-b.webp',
    ])
    expect(listings[0].imageSourceUrl).toBe('https://example.com/images/lazy-a.jpg')
  })

  it('rejects og:image when it is a logo asset', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <meta property="og:image" content="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" />
      <a href="https://example.com/US/Illinois/Chicago/1-A/99/listing.html">One</a>
      <div><img src="https://cdn.example.com/listing-photo.jpg" /></div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].rawPayload.imageUrls).toEqual(['https://cdn.example.com/listing-photo.jpg'])
    expect(listings[0].imageSourceUrl).toBe('https://cdn.example.com/listing-photo.jpg')
  })

  it('returns no image when page only exposes logo/branding images', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <meta property="og:image" content="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" />
      <a href="https://example.com/US/Illinois/Chicago/1-A/99/listing.html">One</a>
      <div>
        <img src="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" />
        <img src="https://example.com/assets/header_banner.png" />
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].imageSourceUrl).toBeNull()
    expect(listings[0].rawPayload.imageUrls).toBeUndefined()
  })

  it('extracts alphanumeric house-number address from nearby detail-like text', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div class="listing">
        <a href="https://yardsaletreasuremap.com/US/Illinois/Oak-Brook/See-source-for-address-after-2026-05-08-22%3A00%3A00/38733355/userlisting.html?s=tl">Garage Sale</a>
        <div class="meta">15W303 61st Pl, Burr Ridge, IL Street View Directions</div>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Oak Brook', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].addressRaw).toBe('15W303 61st Pl, Burr Ridge, IL')
  })

  it('extracts address from embedded metadataStr JSON when URL slug is hidden', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div class="listing">
        <a href="https://yardsaletreasuremap.com/US/Illinois/Elmwood-Park/See-source-for-address-after-2026-05-08-22%3A00%3A00/38733355/userlisting.html?s=tl">Elmwood Park Estate Sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Elmwood-Park/See-source-for-address-after-2026-05-08-22%3A00%3A00/38733355/userlisting.html?s=tl","address":"1234 W Fullerton Ave, Elmwood Park, IL"}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Elmwood Park', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].addressRaw).toBe('1234 W Fullerton Ave, Elmwood Park, IL')
  })

  it('extracts address from metadataStr by external listing id when query differs', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://yardsaletreasuremap.com/US/Illinois/Oak-Brook/See-source-for-address-after-2026-05-08-22%3A00%3A00/38735077/userlisting.html?s=tl">Sale</a>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Oak-Brook/See-source-for-address-after-2026-05-08-22%3A00%3A00/38735077/userlisting.html","address":"15W303 61st Pl, Burr Ridge, IL"}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Oak Brook', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].addressRaw).toBe('15W303 61st Pl, Burr Ridge, IL')
  })

  it('keeps address null when hidden slug has no trustworthy nearby/metadata address', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718697/userlisting.html?s=tl">Estate Sale</a>
        <div>Great vintage finds and collectibles 8:00 am - 3:00 pm 5/9 - 5/9</div>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].addressRaw).toBeNull()
  })

  it('parses weekday-prefixed single day like "Fri 5/8"', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://example.com/US/Illinois/Chicago/100-Main-St/100/listing.html">Sale</a>
        <span>Fri 5/8 8:00 am - 2:00 pm</span>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    const year = new Date().getUTCFullYear()
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBe(`${year}-05-08`)
    expect(listings[0].endDate).toBe(`${year}-05-08`)
  })

  it('parses explicit slash-date range "5/7 - 5/9"', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://example.com/US/Illinois/Chicago/100-Main-St/101/listing.html">Sale</a>
        <span>8:00 am - 3:00 pm 5/7 - 5/9</span>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    const year = new Date().getUTCFullYear()
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBe(`${year}-05-07`)
    expect(listings[0].endDate).toBe(`${year}-05-09`)
  })

  it('parses month-name date range text "Friday, May 8, 2026 ... Saturday, May 9"', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://example.com/US/Illinois/Chicago/100-Main-St/102/listing.html">Sale</a>
        <p>Friday, May 8, 2026 from 8 am - 2 pm / Saturday, May 9, 2026 from 9 am - 1 pm</p>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBe('2026-05-08')
    expect(listings[0].endDate).toBe('2026-05-09')
  })

  it('fills hidden-address variant dates from metadataStr epoch date', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718697/userlisting.html?s=tl">Estate Sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718697/userlisting.html?s=tl","address":"8559 S Maryland Ave, Chicago, IL","date":1778072404,"description":"Friday, May 8, 2026 from 8 am - 2 pm / Saturday, May 9, 2026 from 9 am - 1 pm"}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].addressRaw).toBe('8559 S Maryland Ave, Chicago, IL')
    expect(listings[0].startDate).toBe('2026-05-08')
    expect(listings[0].endDate).toBe('2026-05-09')
  })

  it('fills hidden-address date range from compact month-name metadata description', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718698/userlisting.html?s=tl">Estate Sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718698/userlisting.html?s=tl","address":"8559 S Maryland Ave, Chicago, IL","description":"May 8-9, 2026 8am-2pm"}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBe('2026-05-08')
    expect(listings[0].endDate).toBe('2026-05-09')
  })

  it('uses metadata image fields when nearby listing images are missing', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718699/userlisting.html?s=tl">Estate Sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718699/userlisting.html?s=tl","address":"8559 S Maryland Ave, Chicago, IL","date":"2026-05-08","end_date":"2026-05-09","image_urls":["https://cdn.example.com/a.jpg","https://cdn.example.com/b.jpg"]}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].imageSourceUrl).toBe('https://cdn.example.com/a.jpg')
    expect(listings[0].rawPayload.imageUrls).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
    ])
  })

  it('keeps dates absent when listing has no trustworthy date source', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://example.com/US/Illinois/Chicago/100-Main-St/103/listing.html">No Date Sale</a>
        <div>Address only, no date tokens here.</div>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBeUndefined()
    expect(listings[0].endDate).toBeUndefined()
  })
})
