import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFrom = vi.fn()

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

describe('persistExternalPageSource', () => {
  beforeEach(() => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => listHtml,
      })
    )
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
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => listHtml,
      })
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => html,
      })
    )

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
})
