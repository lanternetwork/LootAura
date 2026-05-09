import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PUBLISH_CLAIM_STALE_PUBLISHING_MS,
  isPublishingRowStaleForPublishClaim,
} from '@/lib/ingestion/publishClaimStale'

/**
 * Stale publishing reclaim boundary for claim_ingested_sales_for_publish.
 * RPC filtering happens in Postgres; we mirror the predicate in publishClaimStale.ts
 * and simulate the RPC return shape here (see migration 162).
 */

const { dnsLookup, loggerInfo, loggerWarn, loggerError, rpcMock, adminDb } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  rpcMock: vi.fn(),
  adminDb: {} as { rpc?: (...args: unknown[]) => unknown },
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

const createPublishedSaleMock = vi.fn()

const mockFromBase = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => {
    adminDb.rpc = rpcMock
    return adminDb
  }),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: (...args: unknown[]) => createPublishedSaleMock(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfo(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: (...args: unknown[]) => loggerError(...args),
  },
}))

const ROW_ID = '66666666-6666-4666-8666-666666666666'
/** Deterministic "current" time for reclaim comparisons and publish timestamps. */
const FIXED_NOW_MS = Date.parse('2026-06-01T12:00:00.000Z')

function baseClaimRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROW_ID,
    source_platform: 'external_page_source',
    source_url: 'https://example.com/stale-reclaim',
    title: 'Stale reclaim fixture',
    description: null,
    normalized_address: '9 Elm St',
    city: 'Denver',
    state: 'CO',
    zip_code: null,
    lat: 39.7,
    lng: -104.9,
    date_start: '2026-06-15',
    date_end: null,
    time_start: '10:00:00',
    time_end: null,
    image_cloudinary_url: null,
    failure_reasons: [],
    raw_payload: { tags: [] },
    image_source_url: null,
    published_sale_id: null,
    ...overrides,
  }
}

function salesMockPatchNoOp(ingestedId: string) {
  return {
    select: (fields: string) => {
      if (fields === 'id') {
        return {
          eq: (col: string, _val: unknown) => {
            if (col === 'ingested_sale_id') {
              return {
                limit: async () => ({ data: [], error: null }),
              }
            }
            return {
              eq: () => ({
                limit: async () => ({ data: [{ id: 'sale-stale-reclaim-1' }], error: null }),
              }),
              limit: async () => ({ data: [{ id: 'sale-stale-reclaim-1' }], error: null }),
            }
          },
        }
      }
      return {
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              ingested_sale_id: ingestedId,
              title: 'Existing sale title',
              description: 'Existing sale description',
              address: 'Existing address',
              date_start: '2026-06-15',
              date_end: null,
              time_start: '10:00:00',
              time_end: null,
              cover_image_url: 'https://synthetic-post-insert.lootaura.test/skip-patch.jpg',
              images: ['https://synthetic-post-insert.lootaura.test/skip-patch.jpg'],
            },
            error: null,
          }),
        }),
      }
    },
    update: () => ({
      eq: async () => ({ error: null }),
    }),
  }
}

function mockBatchFromBase(ingestedId: string) {
  mockFromBase.mockImplementation((_db: unknown, table: string) => {
    if (table === 'ingested_sales') {
      let mode: 'update' | 'select' = 'update'
      return {
        update: () => {
          mode = 'update'
          return {
            eq: async () => ({ error: null }),
          }
        },
        select: (_fields: string) => {
          mode = 'select'
          return {
            in: async () => ({ data: [], error: null }),
          }
        },
        eq: async () => {
          if (mode === 'update') return { error: null }
          return { data: [], error: null }
        },
      }
    }
    if (table === 'sales') {
      return salesMockPatchNoOp(ingestedId)
    }
    return {
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }
  })
}

describe('claim_ingested_sales_for_publish stale publishing reclaim', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_NOW_MS })
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    createPublishedSaleMock.mockResolvedValue({ saleId: 'sale-stale-reclaim-1' })
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.useRealTimers()
  })

  it('predicate: publishing row older than 30m threshold is reclaimable (strict <)', () => {
    const now = new Date(FIXED_NOW_MS)
    const updatedAt = new Date(FIXED_NOW_MS - PUBLISH_CLAIM_STALE_PUBLISHING_MS - 1)
    expect(isPublishingRowStaleForPublishClaim(updatedAt, now)).toBe(true)
  })

  it('predicate: publishing row newer than 30m threshold is NOT reclaimable', () => {
    const now = new Date(FIXED_NOW_MS)
    const updatedAt = new Date(FIXED_NOW_MS - PUBLISH_CLAIM_STALE_PUBLISHING_MS + 1)
    expect(isPublishingRowStaleForPublishClaim(updatedAt, now)).toBe(false)
  })

  it('predicate: exactly at 30m boundary is NOT reclaimable (matches SQL <)', () => {
    const now = new Date(FIXED_NOW_MS)
    const updatedAt = new Date(FIXED_NOW_MS - PUBLISH_CLAIM_STALE_PUBLISHING_MS)
    expect(isPublishingRowStaleForPublishClaim(updatedAt, now)).toBe(false)
  })

  it('when simulated RPC reclaims stale publishing, publishReadyIngestedSales attempts the row', async () => {
    const now = new Date(FIXED_NOW_MS)
    const updatedAt = new Date(FIXED_NOW_MS - PUBLISH_CLAIM_STALE_PUBLISHING_MS - 60_000)
    expect(isPublishingRowStaleForPublishClaim(updatedAt, now)).toBe(true)

    const row = baseClaimRow()
    rpcMock.mockResolvedValue({
      data: [row],
      error: null,
    })
    mockBatchFromBase(ROW_ID)

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()
    expect(summary.attempted).toBe(1)
    expect(summary.succeeded).toBe(1)
  })

  it('when simulated RPC does not reclaim fresh publishing, publishReadyIngestedSales skips the row', async () => {
    const now = new Date(FIXED_NOW_MS)
    const updatedAt = new Date(FIXED_NOW_MS - PUBLISH_CLAIM_STALE_PUBLISHING_MS + 60_000)
    expect(isPublishingRowStaleForPublishClaim(updatedAt, now)).toBe(false)

    rpcMock.mockResolvedValue({
      data: [],
      error: null,
    })
    mockFromBase.mockImplementation(() => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }))

    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()
    expect(summary.attempted).toBe(0)
    expect(summary.succeeded).toBe(0)
  })
})
