import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  fetchHtml: vi.fn(),
  applyImage: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({ rpc: hoisted.adminRpc })),
  fromBase: vi.fn(() => ({
    update: () => ({
      eq: async () => ({ error: null }),
    }),
  })),
}))

vi.mock('@/lib/ingestion/adapters/externalPageSafeFetch', () => ({
  fetchSafeExternalPageHtml: hoisted.fetchHtml,
}))

vi.mock('@/lib/ingestion/images/applyDetailPageImageEnrichment', () => ({
  applyDetailPageImageEnrichment: hoisted.applyImage,
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const ROW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'

describe('enrichPendingImages', () => {
  beforeEach(() => {
    vi.resetModules()
    hoisted.adminRpc.mockReset()
    hoisted.fetchHtml.mockReset()
    hoisted.applyImage.mockReset()
  })

  it('skips fetch when source URL is not a YSTM detail page', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          id: ROW_ID,
          source_platform: 'external_page_source',
          canonical_source_url: null,
          source_url: 'https://yardsaletreasuremap.com/US/Illinois/Chicago.html',
          city: 'Chicago',
          state: 'IL',
          image_enrichment_attempts: 1,
          image_source_url: null,
          failure_reasons: [],
          failure_details: null,
          raw_payload: {},
        },
      ],
      error: null,
    })

    const { enrichPendingImages } = await import('@/lib/ingestion/imageEnrichmentWorker')
    const summary = await enrichPendingImages({ batchSizeOverride: 5 })

    expect(summary.failedTerminal).toBe(1)
    expect(hoisted.fetchHtml).not.toHaveBeenCalled()
  })

  it('skips redundant detail fetch when address enrichment recently parsed HTML', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          id: ROW_ID,
          source_platform: 'external_page_source',
          canonical_source_url: DETAIL_URL,
          source_url: DETAIL_URL,
          city: 'Chicago',
          state: 'IL',
          image_enrichment_attempts: 1,
          image_source_url: null,
          failure_reasons: [],
          failure_details: {
            image_enrichment: {
              schema_version: 1,
              recorded_at: new Date().toISOString(),
              detailHtmlParsed: true,
              detailAttemptSource: 'address_enrichment',
              skipReason: 'no_valid_urls',
            },
          },
          raw_payload: {},
        },
      ],
      error: null,
    })

    const { enrichPendingImages } = await import('@/lib/ingestion/imageEnrichmentWorker')
    const summary = await enrichPendingImages({ batchSizeOverride: 5, cooldownMinutesOverride: 15 })

    expect(summary.skippedRecentDetailAttempt).toBe(1)
    expect(hoisted.fetchHtml).not.toHaveBeenCalled()
    expect(hoisted.applyImage).not.toHaveBeenCalled()
  })

  it('updates row when applyDetailPageImageEnrichment succeeds', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          id: ROW_ID,
          source_platform: 'external_page_source',
          canonical_source_url: DETAIL_URL,
          source_url: DETAIL_URL,
          city: 'Chicago',
          state: 'IL',
          image_enrichment_attempts: 1,
          image_source_url: null,
          failure_reasons: [],
          failure_details: null,
          raw_payload: {},
        },
      ],
      error: null,
    })
    hoisted.fetchHtml.mockResolvedValue('<html>detail</html>')
    hoisted.applyImage.mockResolvedValue({
      skipped: false,
      updated: true,
      mediaStrFound: true,
      validImageCount: 2,
      rejectedCount: 0,
      urlFingerprints: ['abc', 'def'],
    })

    const { enrichPendingImages } = await import('@/lib/ingestion/imageEnrichmentWorker')
    const summary = await enrichPendingImages({ batchSizeOverride: 5 })

    expect(summary.updated).toBe(1)
    expect(hoisted.fetchHtml).toHaveBeenCalledTimes(1)
    expect(hoisted.applyImage).toHaveBeenCalledTimes(1)
  })
})
