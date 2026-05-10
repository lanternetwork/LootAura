import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { adminDb, mockFromBase, loggerInfo } = vi.hoisted(() => ({
  adminDb: {} as Record<string, unknown>,
  mockFromBase: vi.fn(),
  loggerInfo: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => adminDb),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const INGESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const claimedRow = {
  id: INGESTED_ID,
  source_platform: 'manual_upload',
  source_url: 'https://example.com/x',
  title: 'Old sale',
  description: null,
  normalized_address: '1 Main St',
  city: 'Madison',
  state: 'WI',
  zip_code: null,
  lat: 43.07,
  lng: -89.38,
  date_start: '2026-05-01',
  date_end: '2026-05-02',
  time_start: '09:00:00',
  time_end: null,
  image_cloudinary_url: null,
  image_source_url: null,
  raw_payload: {},
  published_sale_id: null,
  failure_reasons: [],
}

describe('publishReadyIngestedSaleById past date_end', () => {
  let expiredUpdatePayload: Record<string, unknown> | null = null
  let ingestedSalesUpdateCount = 0

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
    expiredUpdatePayload = null
    ingestedSalesUpdateCount = 0
    mockFromBase.mockReset()
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table !== 'ingested_sales') {
        return { update: () => ({ eq: async () => ({ error: null }) }) }
      }
      return {
        update: (payload: Record<string, unknown>) => {
          ingestedSalesUpdateCount += 1
          if (ingestedSalesUpdateCount === 1) {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              not: () => chain,
              select: () => ({
                maybeSingle: async () => ({
                  data: claimedRow,
                  error: null,
                }),
              }),
            }
            return chain
          }
          return {
            eq: () => ({
              eq: async () => {
                expiredUpdatePayload = payload
                return { error: null }
              },
            }),
          }
        },
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks row expired (not publish_failed) and returns skipped past_end_date', async () => {
    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    const result = await publishReadyIngestedSaleById(INGESTED_ID)

    expect(result).toEqual({ ok: true, skipped: true, reason: 'past_end_date' })
    expect(expiredUpdatePayload).not.toBeNull()
    expect(expiredUpdatePayload?.status).toBe('expired')
    expect(expiredUpdatePayload?.failure_reasons).toEqual(['sale_expired'])
    const details = expiredUpdatePayload?.failure_details as Record<string, unknown>
    expect(details?.kind).toBe('ingestion_expired')
    expect(details?.reason).toBe('past_end_date')
    expect(loggerInfo).toHaveBeenCalledWith(
      'ingested_sales expired (past date_end)',
      expect.objectContaining({ rowId: INGESTED_ID, dateEnd: '2026-05-02' })
    )
  })

  it('treats ISO timestamp date_end as calendar day for past-end expiry (validate_end_date_single)', async () => {
    const rowIso = { ...claimedRow, date_end: '2026-05-02T00:00:00.000Z' }
    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table !== 'ingested_sales') {
        return { update: () => ({ eq: async () => ({ error: null }) }) }
      }
      let n = 0
      return {
        update: (payload: Record<string, unknown>) => {
          n += 1
          if (n === 1) {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              not: () => chain,
              select: () => ({
                maybeSingle: async () => ({
                  data: rowIso,
                  error: null,
                }),
              }),
            }
            return chain
          }
          return {
            eq: () => ({
              eq: async () => {
                expiredUpdatePayload = payload
                return { error: null }
              },
            }),
          }
        },
      }
    })

    const { publishReadyIngestedSaleById } = await import('@/lib/ingestion/publishWorker')
    await publishReadyIngestedSaleById(INGESTED_ID)
    const details = expiredUpdatePayload?.failure_details as Record<string, unknown>
    expect(details?.original_date_end).toBe('2026-05-02')
  })
})
