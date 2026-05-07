import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFrom = vi.fn()

const { persistDnsLookup } = vi.hoisted(() => ({
  persistDnsLookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: persistDnsLookup,
}))

vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({ from: mockFrom }),
  fromBase: (db: { from: typeof mockFrom }, table: string) => db.from(table),
}))

const listHtml =
  '<a href="https://example.com/US/Illinois/Chicago/100-A/1001/listing.html">One</a>'

function htmlFetchResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

describe('persistExternalPageSource', () => {
  beforeEach(() => {
    persistDnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mockFrom.mockReset()
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'ingested_sales') {
        return {}
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(htmlFetchResponse(listHtml))))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches each source_pages URL and aggregates pagesProcessed', async () => {
    const { persistExternalPageSource } = await import('@/lib/ingestion/adapters/externalPageSource')
    const summary = await persistExternalPageSource({
      city: 'Chicago',
      state: 'IL',
      source_platform: 'external_page_source',
      source_pages: ['https://example.com/p1', 'https://example.com/p2'],
    })
    expect(summary.pagesProcessed).toBe(2)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(summary.fetched).toBe(2)
    expect(summary.inserted).toBe(2)
  })

  it('continues after a failed page fetch and still processes later pages', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(htmlFetchResponse(listHtml))
    vi.stubGlobal('fetch', fetchMock)

    const { persistExternalPageSource } = await import('@/lib/ingestion/adapters/externalPageSource')
    const summary = await persistExternalPageSource({
      city: 'Chicago',
      state: 'IL',
      source_platform: 'external_page_source',
      source_pages: ['https://example.com/bad', 'https://example.com/good'],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(summary.errors).toBe(1)
    expect(summary.pagesProcessed).toBe(2)
    expect(summary.inserted).toBe(1)
  })

  it('treats duplicate source_url as skipped when row already exists', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'existing' }, error: null })
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }))

    const html = `
      <a href="https://example.com/US/Illinois/Chicago/200-B/2002/listing.html">A</a>
      <a href="https://example.com/US/Illinois/Chicago/200-B/2003/listing.html">B</a>
    `
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(htmlFetchResponse(html))))

    const { persistExternalPageSource } = await import('@/lib/ingestion/adapters/externalPageSource')
    const summary = await persistExternalPageSource({
      city: 'Chicago',
      state: 'IL',
      source_platform: 'external_page_source',
      source_pages: ['https://example.com/one-page'],
    })
    expect(summary.fetched).toBe(2)
    expect(summary.inserted).toBe(1)
    expect(summary.skipped).toBe(1)
  })

  it('invokes beforePageFetch hook for each page without changing coverage', async () => {
    const beforePageFetch = vi.fn().mockResolvedValue(undefined)
    const { persistExternalPageSource } = await import('@/lib/ingestion/adapters/externalPageSource')
    const summary = await persistExternalPageSource(
      {
        city: 'Chicago',
        state: 'IL',
        source_platform: 'external_page_source',
        source_pages: ['https://example.com/p1', 'https://example.com/p2'],
      },
      { beforePageFetch }
    )
    expect(beforePageFetch).toHaveBeenCalledTimes(2)
    expect(summary.pagesProcessed).toBe(2)
    expect(summary.fetched).toBe(2)
  })

  it('persists image_source_url from first accepted parser candidate', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert,
    }))

    const html = `
      <meta property="og:image" content="https://yardsaletreasuremap.com/pics/YSTM_site_logo.png" />
      <a href="https://example.com/US/Illinois/Chicago/200-B/2002/listing.html">A</a>
      <div><img src="https://cdn.example.com/listing-primary.jpg" /></div>
    `
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(htmlFetchResponse(html))))

    const { persistExternalPageSource } = await import('@/lib/ingestion/adapters/externalPageSource')
    const summary = await persistExternalPageSource({
      city: 'Chicago',
      state: 'IL',
      source_platform: 'external_page_source',
      source_pages: ['https://example.com/one-page'],
    })

    expect(summary.inserted).toBe(1)
    expect(insert).toHaveBeenCalledTimes(1)
    const insertedRow = insert.mock.calls[0]?.[0]
    expect(insertedRow.image_source_url).toBe('https://cdn.example.com/listing-primary.jpg')
    expect(insertedRow.raw_payload.imageUrls).toEqual(['https://cdn.example.com/listing-primary.jpg'])
  })
})
