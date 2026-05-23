import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFrom = vi.fn()

const { persistDnsLookup, mockAttemptYstmDetailFirstReady, mockMergeYstmDetailFirstMetrics } =
  vi.hoisted(() => ({
    persistDnsLookup: vi.fn(),
    mockAttemptYstmDetailFirstReady: vi.fn(),
    mockMergeYstmDetailFirstMetrics: vi.fn(),
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

vi.mock('@/lib/ingestion/dedupe', () => ({
  evaluateDuplicateSkipForExternalListListing: vi.fn().mockResolvedValue({
    skip: false,
    duplicateOfId: null,
    evaluation: null,
    skipKind: null,
  }),
}))

vi.mock('@/lib/ingestion/publishWorker', () => ({
  publishReadyIngestedSaleById: vi.fn().mockResolvedValue({ ok: true, skipped: true, reason: 'not_eligible' }),
}))

vi.mock('@/lib/ingestion/spatial/resolveSpatialCoordinates', () => ({
  lookupSpatialCoordinates: vi.fn().mockResolvedValue(null),
  pageHtmlEligibleForYstmNative: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/ingestion/acquisition/ystmDetailFirstReady', () => ({
  attemptYstmDetailFirstReady: mockAttemptYstmDetailFirstReady,
  emptyYstmDetailFirstRunMetrics: () => ({
    attempted: 0,
    succeeded: 0,
    published: 0,
    fallback: 0,
    fetchFailed: 0,
    msToPublishedSamples: [],
    rejectedByReason: {},
    addressValidatedFromDetailPage: 0,
    addressValidatedFromListSeed: 0,
    insertFailedByDbCode: {},
  }),
  mergeYstmDetailFirstMetrics: mockMergeYstmDetailFirstMetrics,
  parseYstmDetailFirstConcurrencyFromEnv: () => 4,
  mapWithBoundedConcurrency: async (
    items: unknown[],
    _concurrency: number,
    fn: (item: unknown, index: number) => Promise<void>
  ) => {
    for (let index = 0; index < items.length; index += 1) {
      await fn(items[index], index)
    }
  },
}))

function ingestedSalesInsertChain() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ingest-test-id' }, error: null }),
      })),
    })),
  }
}

function sourceUrlListSelect(limit: ReturnType<typeof vi.fn>) {
  return vi.fn(() => ({
    eq: vi.fn(() => ({
      order: vi.fn(() => ({ limit })),
    })),
  }))
}

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
    mockAttemptYstmDetailFirstReady.mockReset()
    mockMergeYstmDetailFirstMetrics.mockReset()
    mockFrom.mockReset()
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'ingested_sales') {
        return {}
      }
      return ingestedSalesInsertChain()
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

  it('refreshes existing YSTM detail URLs on list re-crawl instead of duplicate skip', async () => {
    const emptyMetrics = {
      attempted: 1,
      succeeded: 1,
      published: 0,
      fallback: 0,
      fetchFailed: 0,
      msToPublishedSamples: [],
      rejectedByReason: {},
      addressValidatedFromDetailPage: 0,
      addressValidatedFromListSeed: 0,
      insertFailedByDbCode: {},
    }
    mockAttemptYstmDetailFirstReady
      .mockResolvedValueOnce({
        result: { outcome: 'ready', ingestedSaleId: 'new-ystm', published: false },
        metrics: emptyMetrics,
      })
      .mockResolvedValueOnce({
        result: { outcome: 'ready', ingestedSaleId: 'existing-ystm', published: true },
        metrics: emptyMetrics,
      })

    const limit = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'existing-ystm',
            status: 'ready',
            failure_reasons: [],
            superseded_by_ingested_sale_id: null,
          },
        ],
        error: null,
      })
    mockFrom.mockImplementation(() => ({
      ...ingestedSalesInsertChain(),
      select: sourceUrlListSelect(limit),
    }))

    const html = `
      <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/200-B/2002/userlisting.html">A</a>
      <a href="https://yardsaletreasuremap.com/US/Illinois/Chicago/200-B/2003/userlisting.html">B</a>
    `
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(htmlFetchResponse(html))))

    const { persistExternalPageSource } = await import('@/lib/ingestion/adapters/externalPageSource')
    const summary = await persistExternalPageSource({
      city: 'Chicago',
      state: 'IL',
      source_platform: 'external_page_source',
      source_pages: ['https://yardsaletreasuremap.com/list'],
    })

    expect(summary.fetched).toBe(2)
    expect(summary.inserted).toBe(1)
    expect(summary.skipped).toBe(0)
    expect(summary.ystmListRecrawlRefreshAttempted).toBe(1)
    expect(summary.ystmListRecrawlRefreshSucceeded).toBe(1)
    expect(mockAttemptYstmDetailFirstReady).toHaveBeenCalledTimes(2)
    expect(mockAttemptYstmDetailFirstReady).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ existingIngestedSaleId: 'existing-ystm' })
    )
  })

  it('treats duplicate source_url as skipped when row already exists', async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'existing',
            status: 'ready',
            failure_reasons: [],
            superseded_by_ingested_sale_id: null,
          },
        ],
        error: null,
      })
    mockFrom.mockImplementation(() => ({
      ...ingestedSalesInsertChain(),
      select: sourceUrlListSelect(limit),
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
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ingest-test-id' }, error: null }),
      })),
    }))
    mockFrom.mockImplementation(() => ({
      select: sourceUrlListSelect(
        vi.fn().mockResolvedValue({ data: [], error: null })
      ),
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
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        image_source_url: 'https://cdn.example.com/listing-primary.jpg',
        raw_payload: expect.objectContaining({
          imageUrls: ['https://cdn.example.com/listing-primary.jpg'],
        }),
      })
    )
  })
})
