import { beforeEach, describe, expect, it, vi } from 'vitest'
import { minimalValidProbeFetchResponse } from '../helpers/minimalProbeImage'

const canonical = 'b'.repeat(64)
const INGESTED_ID = '55555555-5555-4555-8555-555555555555'
const PRIMARY_INGESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LINKED_SALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const { dnsLookup, adminDb } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  adminDb: {} as Record<string, unknown>,
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

const createPublishedSaleMock = vi.fn()
const resolveCrossProviderPublishLinkMock = vi.fn()
const propagateMock = vi.fn().mockResolvedValue({ updatedCount: 0 })
const emitObservabilityRecordMock = vi.fn()

const mockFromBase = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => adminDb),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: (...args: unknown[]) => createPublishedSaleMock(...args),
}))

vi.mock('@/lib/ingestion/identity/resolveCrossProviderPublishLink', () => ({
  resolveCrossProviderPublishLink: (...args: unknown[]) =>
    resolveCrossProviderPublishLinkMock(...args),
}))

vi.mock('@/lib/ingestion/identity/propagateCrossProviderPublishToObservations', () => ({
  propagateCrossProviderPublishToObservations: (...args: unknown[]) => propagateMock(...args),
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (_e: string, f: Record<string, unknown>) => ({ event: _e, ...f }),
  emitObservabilityRecord: (...args: unknown[]) => emitObservabilityRecordMock(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INGESTED_ID,
    source_platform: 'estatesales_net',
    source_url: 'https://estatesales.net/e/1',
    title: 'Estate sale',
    description: null,
    normalized_address: '10 Oak St',
    city: 'Chicago',
    state: 'IL',
    zip_code: null,
    lat: 41.8,
    lng: -87.6,
    date_start: '2026-05-06',
    date_end: null,
    time_start: '09:00:00',
    time_end: null,
    image_cloudinary_url: null,
    failure_reasons: [],
    canonical_sale_instance_key: canonical,
    is_duplicate: false,
    duplicate_of: null,
    raw_payload: {},
    image_source_url: null,
    ...overrides,
  }
}

function makeClaimBuilder(row: unknown) {
  const builder: Record<string, unknown> = {}
  const self = new Proxy(builder, {
    get(_target, prop: string) {
      if (prop === 'maybeSingle') {
        return async () => ({ data: row, error: null })
      }
      if (prop === 'eq' || prop === 'is' || prop === 'not' || prop === 'select' || prop === 'update') {
        return () => self
      }
      return undefined
    },
  })
  return self
}

describe('publishWorker cross-provider publish link (Phase D)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    vi.stubGlobal('fetch', vi.fn(async () => minimalValidProbeFetchResponse()))
    resolveCrossProviderPublishLinkMock.mockResolvedValue({
      publishedSaleId: LINKED_SALE_ID,
      primaryIngestedSaleId: PRIMARY_INGESTED_ID,
      matchedIngestedSaleId: PRIMARY_INGESTED_ID,
      matchMethod: 'canonical_published_sibling',
    })
  })

  it('reuses sibling sale and marks row duplicate without createPublishedSale', async () => {
    const row = baseRow()
    let ingestedUpdatePayload: Record<string, unknown> | null = null

    let ingestedSalesCalls = 0
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'ingested_sales') {
        ingestedSalesCalls += 1
        if (ingestedSalesCalls === 1) {
          return makeClaimBuilder(row)
        }
        return {
          update: (payload: Record<string, unknown>) => {
            ingestedUpdatePayload = payload
            return {
              eq: async () => ({ error: null }),
            }
          },
        }
      }
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  ingested_sale_id: PRIMARY_INGESTED_ID,
                  title: 'Primary',
                  description: '',
                  address: '10 Oak St, Chicago, IL',
                  city: 'Chicago',
                  state: 'IL',
                  date_start: '2026-05-06',
                  date_end: null,
                  time_start: '09:00:00',
                  time_end: null,
                  cover_image_url: null,
                  images: [],
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      return {}
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(INGESTED_ID)

    expect(result.ok).toBe(true)
    expect(createPublishedSaleMock).not.toHaveBeenCalled()
    expect(resolveCrossProviderPublishLinkMock).toHaveBeenCalled()
    expect(ingestedUpdatePayload).toMatchObject({
      status: 'published',
      published_sale_id: LINKED_SALE_ID,
      is_duplicate: true,
      duplicate_of: PRIMARY_INGESTED_ID,
    })
    expect(propagateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalSaleInstanceKey: canonical,
        publishedSaleId: LINKED_SALE_ID,
        primaryIngestedSaleId: PRIMARY_INGESTED_ID,
      })
    )
    expect(emitObservabilityRecordMock).toHaveBeenCalled()
  })
})
