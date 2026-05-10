import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, adminDb, createPublishedSaleMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  adminDb: {} as { rpc?: (...args: unknown[]) => unknown },
  createPublishedSaleMock: vi.fn(),
}))

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
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const ROW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function baseClaimRow() {
  return {
    id: ROW_ID,
    source_platform: 'external_page_source',
    source_url: 'https://example.com/legacy-past-end',
    title: 'Legacy',
    description: null,
    normalized_address: '1 Main St',
    city: 'Denver',
    state: 'CO',
    zip_code: null,
    lat: 39.7,
    lng: -104.9,
    date_start: '2026-06-15',
    date_end: '2026-12-31',
    time_start: '10:00:00',
    time_end: null,
    image_cloudinary_url: null,
    failure_reasons: ['publish_error', 'invalid_date'],
    raw_payload: {},
    image_source_url: null,
    published_sale_id: null,
  }
}

describe('publishReadyIngestedSales legacy publishing validation past_end_date', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPublishedSaleMock.mockReset()
    rpcMock.mockResolvedValue({ data: [baseClaimRow()], error: null })

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
        select: (fields: string) => ({
          in: async () => {
            expect(fields).toContain('failure_details')
            return {
              data: [
                {
                  id: ROW_ID,
                  failure_details: {
                    phase: 'validation',
                    reason: 'past_end_date',
                    publish_error: 'date window invalid',
                  },
                },
              ],
              error: null,
            }
          },
        }),
        update: (payload: Record<string, unknown>) => {
          if (payload.status === 'expired') {
            expect(payload).not.toHaveProperty('published_sale_id')
            expect(payload).not.toHaveProperty('failure_details')
            expect(payload.failure_reasons).toEqual(['invalid_date', 'sale_expired'])
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }
          }
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }
        },
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('migrates legacy claim row to expired without publish retry or linkage fields', async () => {
    const { publishReadyIngestedSales } = await import('@/lib/ingestion/publishWorker')
    const summary = await publishReadyIngestedSales()

    expect(createPublishedSaleMock).not.toHaveBeenCalled()
    expect(summary.attempted).toBe(1)
    expect(summary.expired).toBe(1)
    expect(summary.succeeded).toBe(0)
    expect(summary.failed).toBe(0)
  })
})
