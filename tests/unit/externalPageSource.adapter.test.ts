import { describe, it, expect } from 'vitest'

describe('isObviouslyNonAddressLeadToken', () => {
  it('detects compact and spaced time-of-day lead tokens', async () => {
    const { isObviouslyNonAddressLeadToken } = await import('@/lib/ingestion/adapters/externalPageSource')
    expect(isObviouslyNonAddressLeadToken('10am Saturday estate sale')).toBe(true)
    expect(isObviouslyNonAddressLeadToken('9:30am Multi family sale')).toBe(true)
    expect(isObviouslyNonAddressLeadToken('9:30 am huge sale')).toBe(true)
    expect(isObviouslyNonAddressLeadToken('12:15pm Estate sale event')).toBe(true)
    expect(isObviouslyNonAddressLeadToken('8 pm Friday sale')).toBe(true)
    expect(isObviouslyNonAddressLeadToken('8:00:15 am start')).toBe(true)
  })

  it('does not reject valid numbered street lines', async () => {
    const { isObviouslyNonAddressLeadToken } = await import('@/lib/ingestion/adapters/externalPageSource')
    expect(isObviouslyNonAddressLeadToken('123 Main St, Chicago, IL')).toBe(false)
    expect(isObviouslyNonAddressLeadToken('12 Main Street, Downers Grove, IL')).toBe(false)
    expect(isObviouslyNonAddressLeadToken('15W303 61st Pl, Burr Ridge, IL')).toBe(false)
  })
})

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
    expect(listings[0].addressRaw).toBe('3805 N Sacramento Ave, Chicago, IL')
    expect(listings[0].rawPayload.adapter).toBe('external_page_source')
    const diag = listings[0].rawPayload.ingestionDiagnostics as {
      chosenAddressSource?: string
      slugWasPlaceholder?: boolean
      rejectedAddressCandidates?: unknown[]
      nearbyCandidateCount?: number
      metadataAddressSkippedAsUntrusted?: boolean
    }
    expect(diag.chosenAddressSource).toBe('slug')
    expect(diag.slugWasPlaceholder).toBe(false)
    expect(Array.isArray(diag.rejectedAddressCandidates)).toBe(true)
    expect(diag.nearbyCandidateCount).toBeGreaterThanOrEqual(0)
    expect(diag.metadataAddressSkippedAsUntrusted).toBe(false)
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
    const diag = listings[0].rawPayload.ingestionDiagnostics as {
      chosenAddressSource?: string
      slugWasPlaceholder?: boolean
      rejectedAddressCandidates?: { candidate: string; rejectionReason: string }[]
      nearbyCandidateCount?: number
      metadataAddressSkippedAsUntrusted?: boolean
    }
    expect(diag.chosenAddressSource).toBe('metadata')
    expect(diag.slugWasPlaceholder).toBe(true)
    expect(diag.metadataAddressSkippedAsUntrusted).toBe(false)
    expect(diag.rejectedAddressCandidates).toEqual([])
    expect(diag.nearbyCandidateCount).toBeGreaterThanOrEqual(0)
  })

  it('rejects time-first prose as address when a real street line follows on the next text line', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    // Use a real LF in markup (not only &#10;) so JSDOM textContent always splits lines on Linux CI.
    const html = `
      <div class="listing">
        <div class="detail">10am Saturday huge sale${'\n'}5000 Main Street, Downers Grove, IL</div>
        <div class="row">
          <a href="https://example.com/US/Illinois/Downers-Grove/See-source-for-address-after-2026-05-08-22%3A00%3A00/777/userlisting.html?s=tl"><img src="https://example.com/listing-thumb.png" alt="" /></a>
        </div>
      </div>
    `
    const { listings, invalid } = parseExternalPageSourceHtml(
      html,
      { city: 'Downers Grove', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(invalid).toBe(0)
    expect(listings).toHaveLength(1)
    expect(listings[0].addressRaw).toBe('5000 Main Street, Downers Grove, IL')
    const diag = listings[0].rawPayload.ingestionDiagnostics as {
      chosenAddressSource?: string
      rejectedAddressCandidates?: { candidate: string; rejectionReason: string }[]
      nearbyCandidateCount?: number
    }
    expect(diag.chosenAddressSource).toBe('nearby')
    expect(diag.nearbyCandidateCount).toBeGreaterThanOrEqual(2)
    expect(diag.rejectedAddressCandidates?.some((r) => r.rejectionReason === 'non_address_time_lead')).toBe(true)
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

  it("parses Pre-Mother's Garage Sale metadata start/end_date fields", async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718701/userlisting.html?s=tl">Pre-Mother's Garage Sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718701/userlisting.html?s=tl","title":"Pre-Mother\\'s Garage Sale","address":"1409 W Arthur Ave, Chicago, IL","start_date":"2026-05-08","end_date":"2026-05-09"}]}';
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

  it('parses multi Family yard sale metadata date_start/date_end fields', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718702/userlisting.html?s=tl">multi Family yard sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718702/userlisting.html?s=tl","title":"multi Family yard sale","address":"7217 S Seeley Ave, Chicago, IL","date_start":"2026-05-09","date_end":"2026-05-10"}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBe('2026-05-09')
    expect(listings[0].endDate).toBe('2026-05-10')
  })

  it('parses Evanston Estate Sale metadata ISO datetime fields', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Evanston/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718703/userlisting.html?s=tl">Evanston Estate Sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Evanston/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718703/userlisting.html?s=tl","title":"Evanston Estate Sale","address":"2020 Central St, Evanston, IL","startDate":"2026-05-10T00:00:00.000Z","endDate":"2026-05-11T00:00:00.000Z"}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Evanston', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBe('2026-05-10')
    expect(listings[0].endDate).toBe('2026-05-11')
  })

  it("parses CAIT'S estate sale dates from metadata title when description lacks date", async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718704/userlisting.html?s=tl">CAIT'S estate sale examples</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Illinois/Chicago/See-source-for-address-after-2026-05-06-09%3A00%3A00/38718704/userlisting.html?s=tl","title":"CAIT\\'S estate sale May 11-12, 2026","address":"5524 N Sawyer Ave, Chicago, IL","description":"Estate sale details posted soon"}]}';
      </script>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].startDate).toBe('2026-05-11')
    expect(listings[0].endDate).toBe('2026-05-12')
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

  it('avoids cross-listing city contamination from config city on mixed-city links', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Plainfield/14030-S-Chatham-Ct/38720001/listing.html">Plainfield listing</a>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Joliet/201-W-Jefferson-St/38720002/listing.html">Joliet listing</a>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Tinley-Park/17345-67th-Ct/38720003/listing.html">Tinley Park listing</a>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Berkeley', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(3)
    expect(listings.map((l) => l.city)).toEqual(['Plainfield', 'Joliet', 'Tinley Park'])
    expect(listings.every((l) => l.state === 'IL')).toBe(true)
    expect(listings.map((l) => l.rawPayload.citySource)).toEqual(['listing_url', 'listing_url', 'listing_url'])
  })

  it('normalizes path city slug artifacts and never emits Chicago.html', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <div>
        <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago.html/100-Main-St/38720004/listing.html">Listing</a>
      </div>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago.html', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].city).toBe('Chicago')
    expect(listings[0].city).not.toBe('Chicago.html')
    expect(listings[0].rawPayload.citySource).toBe('listing_url')
  })

  it('prefers Munster from address tail when street is concrete and conflicts with URL Fair Oaks', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    // See-source slug: no street from path; metadataStr supplies Munster address (same pattern as live YSTM pages).
    const html = `
      <div class="listing">
        <a href="https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/See-source-for-address-after-2026-05-10-10%3A00%3A00/38730010/userlisting.html?s=tl">Sale</a>
      </div>
      <script>
        const metadataStr = '{"sales":[{"url":"https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/See-source-for-address-after-2026-05-10-10%3A00%3A00/38730010/userlisting.html?s=tl","address":"123 Example St, Munster, IN 46321","start_date":"2026-05-10","end_date":"2026-05-10"}]}';
      </script>
    `
    const { listings, invalid } = parseExternalPageSourceHtml(
      html,
      { city: 'Highland', state: 'IN', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(invalid).toBe(0)
    expect(listings).toHaveLength(1)
    expect(listings[0].city).toBe('Munster')
    expect(listings[0].rawPayload.cityConflict).toBe(true)
    expect(listings[0].rawPayload.addressTailCity).toBe('Munster')
    expect(listings[0].rawPayload.citySource).toBe('address_tail')
  })

  it('hub Chicago.html then Park-City yields Park City', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago.html/Park-City/100-Main-St/38730011/listing.html">Sale</a>
    `
    const { listings } = parseExternalPageSourceHtml(
      html,
      { city: 'Chicago', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(listings).toHaveLength(1)
    expect(listings[0].city).toBe('Park City')
    expect(listings[0].rawPayload.hubSegment).toBe('Chicago.html')
    expect(listings[0].rawPayload.pathCitySlug).toBe('Park-City')
  })

  it('hub Chicago.html then Lindenhurst never persists Chicago.html as city', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago.html/Lindenhurst/100-Main-St/38730012/listing.html">Sale</a>
    `
    const { listings, invalid } = parseExternalPageSourceHtml(
      html,
      { city: 'Lindenhurst', state: 'IL', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(invalid).toBe(0)
    expect(listings).toHaveLength(1)
    expect(listings[0].city).toBe('Lindenhurst')
    expect(listings[0].city).not.toMatch(/\.html$/i)
    expect((listings[0].addressRaw ?? '').toLowerCase()).toContain('lindenhurst')
    const diag = listings[0].rawPayload.ingestionDiagnostics as {
      authority?: { urlCity?: string | null; resolvedCity?: string }
    }
    expect(diag.authority?.urlCity).toBe('Lindenhurst')
    expect(diag.authority?.resolvedCity).toBe('Lindenhurst')
  })

  it('does not apply shared metadata Munster address across different URL municipalities when slug supplies street', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const html = `
      <script>
        const metadataStr = '{"sales":[
          {"url":"https://yardsaletreasuremap.com/US/Indiana/Valparaiso/100-Main-St/201/listing.html","address":"900 Shared Rd, Munster, IN 46321","start_date":"2026-06-01","end_date":"2026-06-01"},
          {"url":"https://yardsaletreasuremap.com/US/Indiana/Hobart/100-Main-St/202/listing.html","address":"900 Shared Rd, Munster, IN 46321","start_date":"2026-06-01","end_date":"2026-06-01"},
          {"url":"https://yardsaletreasuremap.com/US/Indiana/Schererville/100-Main-St/203/listing.html","address":"900 Shared Rd, Munster, IN 46321","start_date":"2026-06-01","end_date":"2026-06-01"},
          {"url":"https://yardsaletreasuremap.com/US/Indiana/Hammond/100-Main-St/204/listing.html","address":"900 Shared Rd, Munster, IN 46321","start_date":"2026-06-01","end_date":"2026-06-01"}
        ]}';
      </script>
      <a href="https://yardsaletreasuremap.com/US/Indiana/Valparaiso/100-Main-St/201/listing.html">A</a>
      <a href="https://yardsaletreasuremap.com/US/Indiana/Hobart/100-Main-St/202/listing.html">B</a>
      <a href="https://yardsaletreasuremap.com/US/Indiana/Schererville/100-Main-St/203/listing.html">C</a>
      <a href="https://yardsaletreasuremap.com/US/Indiana/Hammond/100-Main-St/204/listing.html">D</a>
    `
    const { listings, invalid } = parseExternalPageSourceHtml(
      html,
      { city: 'Valparaiso', state: 'IN', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(invalid).toBe(0)
    expect(listings).toHaveLength(4)
    const cities = listings.map((l) => l.city).sort()
    expect(cities).toEqual(['Hammond', 'Hobart', 'Schererville', 'Valparaiso'])
    for (const l of listings) {
      expect((l.addressRaw ?? '').toLowerCase()).not.toContain('munster')
      expect((l.addressRaw ?? '').toLowerCase()).toContain(l.city.toLowerCase())
    }
  })

  it('sets metadataAddressSkippedAsUntrusted when shared metadata address is not trusted', async () => {
    const { parseExternalPageSourceHtml } = await import('@/lib/ingestion/adapters/externalPageSource')
    const urlV =
      'https://yardsaletreasuremap.com/US/Indiana/Valparaiso/See-source-for-address-after-2026-06-01-10%3A00%3A00/38740001/userlisting.html?s=tl'
    const urlH =
      'https://yardsaletreasuremap.com/US/Indiana/Hobart/See-source-for-address-after-2026-06-01-10%3A00%3A00/38740002/userlisting.html?s=tl'
    const html = `
      <script>
        const metadataStr = '{"sales":[
          {"url":"${urlV}","address":"900 Shared Rd, Munster, IN 46321","start_date":"2026-06-01","end_date":"2026-06-01"},
          {"url":"${urlH}","address":"900 Shared Rd, Munster, IN 46321","start_date":"2026-06-01","end_date":"2026-06-01"}
        ]}';
      </script>
      <a href="${urlV}">Valparaiso hidden</a>
    `
    const { listings, invalid } = parseExternalPageSourceHtml(
      html,
      { city: 'Valparaiso', state: 'IN', source_platform: 'external_page_source', source_pages: [] },
      LIST
    )
    expect(invalid).toBe(0)
    expect(listings).toHaveLength(1)
    expect(listings[0].addressRaw).toBeNull()
    const diag = listings[0].rawPayload.ingestionDiagnostics as {
      chosenAddressSource?: string
      metadataAddressSkippedAsUntrusted?: boolean
      slugWasPlaceholder?: boolean
    }
    expect(diag.chosenAddressSource).toBe('none')
    expect(diag.metadataAddressSkippedAsUntrusted).toBe(true)
    expect(diag.slugWasPlaceholder).toBe(true)
    expect(listings[0].startDate).toBe('2026-06-01')
  })
})
