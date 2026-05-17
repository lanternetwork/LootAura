import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  syncMedia: vi.fn(),
  ingestUpdate: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn(() => ({
    update: () => ({
      eq: () => ({
        select: () => ({
          maybeSingle: async () => {
            hoisted.ingestUpdate()
            return { data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, error: null }
          },
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/ingestion/images/syncPublishedSaleMediaFromIngest', () => ({
  syncPublishedSaleMediaFromIngestedRow: hoisted.syncMedia,
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: vi.fn((event: string, payload: unknown) => ({ event, payload })),
  emitObservabilityRecord: vi.fn(),
}))

const ROW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PAGE_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'
const MEDIA_HTML = `<script>const mediaStr = '{"baseUrl":"https://gsf.tlstatic.com/image/w700-h500/2026/05/16/s/4/3/21584843","media":["a.jpeg"]}';</script>`

describe('applyDetailPageImageEnrichment post-publish media sync', () => {
  beforeEach(() => {
    vi.resetModules()
    hoisted.syncMedia.mockReset()
    hoisted.ingestUpdate.mockReset()
    hoisted.syncMedia.mockResolvedValue({
      outcome: 'updated_full',
      publishedSaleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sanitizedCount: 1,
    })
  })

  it('triggers syncPublishedSaleMediaFromIngestedRow after ingest row is updated', async () => {
    const { applyDetailPageImageEnrichment } = await import(
      '@/lib/ingestion/images/applyDetailPageImageEnrichment'
    )
    const result = await applyDetailPageImageEnrichment({
      rowId: ROW_ID,
      sourceUrl: PAGE_URL,
      html: MEDIA_HTML,
      existingImageSourceUrl: null,
      existingRawPayload: {},
      detailAttemptSource: 'image_enrichment',
      city: 'Chicago',
      state: 'IL',
    })

    expect(result.updated).toBe(true)
    expect(hoisted.ingestUpdate).toHaveBeenCalledTimes(1)
    expect(hoisted.syncMedia).toHaveBeenCalledTimes(1)
    expect(hoisted.syncMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        rowId: ROW_ID,
        city: 'Chicago',
        state: 'IL',
        imageSourceUrl: expect.stringContaining('a.jpeg'),
        rawPayload: expect.objectContaining({
          imageUrls: expect.arrayContaining([expect.stringContaining('a.jpeg')]),
        }),
      })
    )
  })

  it('does not trigger sync when merge produces no ingest update', async () => {
    const { applyDetailPageImageEnrichment } = await import(
      '@/lib/ingestion/images/applyDetailPageImageEnrichment'
    )
    const existingUrl = 'https://gsf.tlstatic.com/image/w700-h500/2026/05/16/s/4/3/21584843/a.jpeg'
    const result = await applyDetailPageImageEnrichment({
      rowId: ROW_ID,
      sourceUrl: PAGE_URL,
      html: MEDIA_HTML,
      existingImageSourceUrl: existingUrl,
      existingRawPayload: { imageUrls: [existingUrl] },
    })

    expect(result.updated).toBe(false)
    expect(hoisted.syncMedia).not.toHaveBeenCalled()
  })
})
