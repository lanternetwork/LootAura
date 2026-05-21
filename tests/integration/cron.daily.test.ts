/**
 * Integration tests for daily cron orchestration
 * Tests GET /api/cron/daily endpoint that orchestrates multiple tasks
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { INGESTION_ORCHESTRATION_DEFAULTS } from '@/lib/ingestion/ingestionOrchestrationDefaults'

// Mock cron auth
const mockAssertCronAuthorized = vi.fn()

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: (...args: any[]) => mockAssertCronAuthorized(...args),
}))

// Mock admin DB
const mockAdminDb = {
  from: vi.fn(),
  rpc: vi.fn(),
}

// Mock job processors
const mockProcessFavoriteSalesStartingSoonJob = vi.fn()
const mockSendModerationDailyDigestEmail = vi.fn()

vi.mock('@/lib/jobs/processor', () => ({
  processFavoriteSalesStartingSoonJob: (...args: any[]) => mockProcessFavoriteSalesStartingSoonJob(...args),
}))

vi.mock('@/lib/email/moderationDigest', () => ({
  sendModerationDailyDigestEmail: (...args: any[]) => mockSendModerationDailyDigestEmail(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => db.from(table),
}))

const {
  mockGeocodePendingSales,
  mockPublishReadyIngestedSales,
  mockFinalizeLinkedPublishedIngestedSales,
  mockEnrichPendingAddresses,
  mockEnrichPendingImages,
  mockRunNativeCoordinateRemediation,
} = vi.hoisted(() => ({
  mockGeocodePendingSales: vi.fn(),
  mockPublishReadyIngestedSales: vi.fn(),
  mockFinalizeLinkedPublishedIngestedSales: vi.fn(),
  mockEnrichPendingAddresses: vi.fn(),
  mockEnrichPendingImages: vi.fn(),
  mockRunNativeCoordinateRemediation: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  geocodePendingSales: (...args: unknown[]) => mockGeocodePendingSales(...args),
}))

vi.mock('@/lib/ingestion/addressEnrichmentWorker', () => ({
  enrichPendingAddresses: (...args: unknown[]) => mockEnrichPendingAddresses(...args),
}))

vi.mock('@/lib/ingestion/imageEnrichmentWorker', () => ({
  enrichPendingImages: (...args: unknown[]) => mockEnrichPendingImages(...args),
}))

vi.mock('@/lib/ingestion/nativeCoordinateRemediationWorker', () => ({
  runNativeCoordinateRemediation: (...args: unknown[]) => mockRunNativeCoordinateRemediation(...args),
}))

const { mockRunWithGeocodePipelineLease, mockRecordConfigCrawlStats } = vi.hoisted(() => ({
  mockRunWithGeocodePipelineLease: vi.fn(),
  mockRecordConfigCrawlStats: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodePipelineLease', () => ({
  runWithGeocodePipelineLease: (...args: unknown[]) => mockRunWithGeocodePipelineLease(...args),
}))

vi.mock('@/lib/ingestion/acquisition/configCrawlStats', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/ingestion/acquisition/configCrawlStats')>()
  return {
    ...actual,
    recordConfigCrawlStats: (...args: unknown[]) => mockRecordConfigCrawlStats(...args),
  }
})

vi.mock('@/lib/ingestion/acquisition/yieldAwareCrawlSchedule', () => ({
  buildYieldAwareCrawlPlan: <T,>(rows: T[]) => rows,
}))

vi.mock('@/lib/ingestion/publishWorker', () => ({
  publishReadyIngestedSales: (...args: unknown[]) => mockPublishReadyIngestedSales(...args),
  finalizeLinkedPublishedIngestedSales: (...args: unknown[]) => mockFinalizeLinkedPublishedIngestedSales(...args),
}))

const { mockFetchLastSuccessfulExternalIngestionAt } = vi.hoisted(() => ({
  mockFetchLastSuccessfulExternalIngestionAt: vi.fn(),
}))

vi.mock('@/lib/ingestion/orchestrationMetrics', () => ({
  recordIngestionOrchestrationRun: vi.fn().mockResolvedValue(undefined),
  fetchLastSuccessfulExternalIngestionAt: (...args: unknown[]) =>
    mockFetchLastSuccessfulExternalIngestionAt(...args),
}))

const mockResolveAdaptiveThroughputForCron = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ingestion/adaptiveThroughputSignals', () => ({
  resolveAdaptiveThroughputForCron: mockResolveAdaptiveThroughputForCron,
}))

const { mockPersistExternalPageSource } = vi.hoisted(() => ({
  mockPersistExternalPageSource: vi.fn(),
}))

vi.mock('@/lib/ingestion/adapters/externalPageSource', async () => {
  const mod = await vi.importActual<typeof import('@/lib/ingestion/adapters/externalPageSource')>(
    '@/lib/ingestion/adapters/externalPageSource'
  )
  return {
    ...mod,
    persistExternalPageSource: (...args: unknown[]) => mockPersistExternalPageSource(...args),
  }
})

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  generateOperationId: vi.fn(() => 'test-op-id-123'),
}))

// Deterministic base date for all tests: 2025-01-15 12:00:00 UTC (Wednesday)
const MOCK_BASE_DATE = new Date('2025-01-15T12:00:00.000Z')

// Helper to create date strings relative to base date
function getDateString(daysOffset: number): string {
  const date = new Date(MOCK_BASE_DATE)
  date.setUTCDate(date.getUTCDate() + daysOffset)
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

// Helper to mock Date.getUTCDay() to return Friday (day 5)
function mockFridayDate() {
  const originalGetUTCDay = Date.prototype.getUTCDay
  const originalDateConstructor = global.Date
  
  // Mock getUTCDay to always return 5 (Friday)
  Date.prototype.getUTCDay = vi.fn(() => 5)
  
  return () => {
    Date.prototype.getUTCDay = originalGetUTCDay
    global.Date = originalDateConstructor
  }
}

function ingestionCityConfigsDbMock() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })),
  }
}

/** Default success mocks for SQL-batched archive job (`runArchiveEndedSalesJob`). */
function defaultArchiveAdminRpcImpl() {
  return async (fn: string, _args?: unknown) => {
    if (fn === 'count_sales_pending_archive') {
      return {
        data: {
          today_utc_date: '2025-01-15',
          pending_via_ends_at: 0,
          pending_via_legacy: 0,
          published_past_ends_at: 0,
          active_past_ends_at: 0,
          suspicious_ends_before_starts: 0,
        },
        error: null,
      }
    }
    if (fn === 'archive_sales_ended_batch') {
      return { data: [{ archived_via_ends_at: 0, archived_via_legacy: 0 }], error: null }
    }
    return { data: null, error: null }
  }
}

function ingestionCityConfigsExternalPageSourceMock() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            city: 'ExampleCity',
            state: 'IL',
            source_platform: 'external_page_source',
            source_pages: ['https://example.com/list-a', 'https://example.com/list-b'],
          },
        ],
        error: null,
      }),
    })),
  }
}

function ingestionCityConfigsExternalPageSourceRowsMock(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        data: rows,
        error: null,
      }),
    })),
  }
}

function createIngestionOrchestrationStateTableMock(initial: {
  cursor?: number
  lease_owner?: string | null
  lease_expires_at?: string | null
}) {
  const state = {
    key: 'external_page_source',
    cursor: initial.cursor ?? 0,
    lease_owner: initial.lease_owner ?? null,
    lease_expires_at: initial.lease_expires_at ?? null,
  }
  return {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({
          data: [{ ...state }],
          error: null,
        }),
      })),
    })),
    update: vi.fn((payload: Record<string, unknown>) => {
      const conditions: Record<string, unknown> = {}
      const addEq = (field: string, value: unknown) => {
        conditions[field] = { op: 'eq', value }
      }
      const addIs = (field: string, value: unknown) => {
        conditions[field] = { op: 'is', value }
      }
      const evaluateMatches = () => {
        const keys = Object.keys(conditions)
        for (const field of keys) {
          const c = conditions[field] as { op: 'eq' | 'is'; value: unknown }
          const actual = (state as Record<string, unknown>)[field]
          if (c.op === 'eq') {
            // Match Postgres/PostgREST semantics: `= NULL` never matches.
            if (c.value === null) return false
            if (actual !== c.value) return false
          } else if (c.op === 'is') {
            if (actual !== c.value) return false
          }
        }
        return true
      }

      const chain = {
        eq: vi.fn((field: string, value: unknown) => {
          addEq(field, value)
          return chain
        }),
        is: vi.fn((field: string, value: unknown) => {
          addIs(field, value)
          return chain
        }),
        select: vi.fn((selection?: string) => {
          if (!evaluateMatches()) return Promise.resolve({ data: [], error: null })
          Object.assign(state, payload)
          if (selection === 'cursor') {
            return Promise.resolve({ data: [{ cursor: state.cursor }], error: null })
          }
          return Promise.resolve({ data: [{ key: state.key }], error: null })
        }),
      }
      return chain
    }),
    __getState: () => ({ ...state }),
  }
}

describe('GET /api/cron/daily', () => {
  let GET: any

  beforeAll(async () => {
    const route = await import('@/app/api/cron/daily/route')
    GET = route.GET
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    const { installAdaptiveThroughputCronMock } = await import('../helpers/mockAdaptiveThroughputForCron')
    installAdaptiveThroughputCronMock(mockResolveAdaptiveThroughputForCron)
    mockFetchLastSuccessfulExternalIngestionAt.mockResolvedValue(null)
    mockAssertCronAuthorized.mockImplementation(() => {}) // Pass auth by default
    mockProcessFavoriteSalesStartingSoonJob.mockResolvedValue({ success: true })
    mockSendModerationDailyDigestEmail.mockResolvedValue({ ok: true })
    mockGeocodePendingSales.mockResolvedValue({
      claimed: 0,
      succeeded: 0,
      failedRetriable: 0,
      failedTerminal: 0,
      rate429Count: 0,
    })
    mockEnrichPendingAddresses.mockResolvedValue({
      claimed: 0,
      succeeded: 0,
      failedRetriable: 0,
      failedTerminal: 0,
      stillGated: 0,
      byFailureReason: {},
    })
    mockEnrichPendingImages.mockResolvedValue({
      claimed: 0,
      attempted: 0,
      updated: 0,
      skippedUnchanged: 0,
      skippedRecentDetailAttempt: 0,
      failedRetriable: 0,
      failedTerminal: 0,
      mediaStrFound: 0,
      mediaStrMissing: 0,
      byFailureReason: {},
    })
    mockRunNativeCoordinateRemediation.mockResolvedValue({
      claimed: 0,
      promoted: 0,
      cacheHits: 0,
      retryScheduled: 0,
      fallbackToGeocode: 0,
      terminal: 0,
      skipped: 0,
      fetchFailed: 0,
      publishFailed: 0,
    })
    mockPublishReadyIngestedSales.mockResolvedValue({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    })
    mockFinalizeLinkedPublishedIngestedSales.mockResolvedValue({
      attempted: 0,
      finalized: 0,
      alreadyPublished: 0,
      linkMismatch: 0,
      missingLinkedSale: 0,
    })
    mockPersistExternalPageSource.mockResolvedValue({
      fetched: 0,
      inserted: 0,
      skipped: 0,
      invalid: 0,
      errors: 0,
      pagesProcessed: 0,
    })
    mockRunWithGeocodePipelineLease.mockImplementation(async ({ execute }: { execute: () => Promise<unknown> }) => ({
      ok: true,
      skipped: false,
      result: await execute(),
      lease: { acquired: true, owner: 'test', staleRecovered: false, cursor: 0 },
    }))
    mockRecordConfigCrawlStats.mockResolvedValue(undefined)

    mockAdminDb.rpc.mockImplementation(defaultArchiveAdminRpcImpl())

    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
    delete process.env.GEOCODE_BACKLOG_BATCH_SIZE
  })

  describe('Cron authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const { NextResponse } = await import('next/server')
      mockAssertCronAuthorized.mockImplementation(() => {
        throw NextResponse.json(
          { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      })

      const request = new NextRequest('http://localhost/api/cron/daily', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Unauthorized')
      
      // Verify no jobs were executed
      expect(mockProcessFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
      expect(mockSendModerationDailyDigestEmail).not.toHaveBeenCalled()
    })

    it('returns 401 for ?mode=ingestion when Authorization header is missing', async () => {
      const { NextResponse } = await import('next/server')
      mockAssertCronAuthorized.mockImplementation(() => {
        throw NextResponse.json(
          { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(mockGeocodePendingSales).not.toHaveBeenCalled()
      expect(mockPublishReadyIngestedSales).not.toHaveBeenCalled()
    })

    it('allows request with valid cron auth', async () => {
      // Mock archive sales query (no sales to archive)
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsDbMock()
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.job).toBe('daily')
      expect(data.mode).toBe('daily')
      expect(data.tasks).toBeDefined()
    })
  })

  describe('Task orchestration', () => {
    beforeEach(() => {
      // Mock archive sales query (no sales to archive)
      // Mock sale_reports query for moderation digest (empty)
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsDbMock()
        }
        return { from: vi.fn() }
      })
    })

    it('executes all expected tasks in sequence', async () => {
      // Mock Friday so moderation digest runs
      const restoreDate = mockFridayDate()
      
      try {
        const request = new NextRequest('http://localhost/api/cron/daily', {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-cron-secret',
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.ok).toBe(true)
        expect(data.mode).toBe('daily')

        // Verify all tasks are present in response
        expect(data.tasks.archiveSales).toBeDefined()
        expect(data.tasks.favoritesStartingSoon).toBeDefined()
        expect(data.tasks.moderationDigest).toBeDefined()
        
        // Verify job processors were called
        expect(mockProcessFavoriteSalesStartingSoonJob).toHaveBeenCalledTimes(1)
        expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledTimes(1)
        expect(mockGeocodePendingSales).toHaveBeenCalledTimes(1)
        expect(mockPublishReadyIngestedSales).toHaveBeenCalledTimes(1)
      } finally {
        restoreDate()
      }
    })

    it('includes archive sales task result', async () => {
      const yesterday = getDateString(-1)
      const salesToArchive = [
        {
          id: 'sale-1',
          title: 'Sale 1',
          date_start: getDateString(-2),
          date_end: yesterday,
          status: 'published',
          archived_at: null,
        },
      ]

      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({
                  data: salesToArchive,
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: 'sale-1' }],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsDbMock()
        }
        return { from: vi.fn() }
      })

      let archiveEndedBatchCalls = 0
      mockAdminDb.rpc.mockImplementation(async (fn: string) => {
        if (fn === 'count_sales_pending_archive') {
          return {
            data: {
              today_utc_date: '2025-01-15',
              pending_via_ends_at: 1,
              pending_via_legacy: 0,
              published_past_ends_at: 1,
              active_past_ends_at: 0,
              suspicious_ends_before_starts: 0,
            },
            error: null,
          }
        }
        if (fn === 'archive_sales_ended_batch') {
          archiveEndedBatchCalls += 1
          if (archiveEndedBatchCalls === 1) {
            return { data: [{ archived_via_ends_at: 1, archived_via_legacy: 0 }], error: null }
          }
          return { data: [{ archived_via_ends_at: 0, archived_via_legacy: 0 }], error: null }
        }
        return { data: null, error: null }
      })

      const request = new NextRequest('http://localhost/api/cron/daily', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks.archiveSales).toBeDefined()
      expect(data.tasks.archiveSales.ok).toBe(true)
      expect(data.tasks.archiveSales.archived).toBe(1)
    })

    it('includes favorites starting soon task result', async () => {
      mockProcessFavoriteSalesStartingSoonJob.mockResolvedValue({
        success: true,
      })

      // Mock archive sales query (no sales to archive)
      // Mock sale_reports query for moderation digest (empty)
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsDbMock()
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks.favoritesStartingSoon).toBeDefined()
      expect(data.tasks.favoritesStartingSoon.ok).toBe(true)
    })

    it('includes moderation digest task result', async () => {
      // Mock Friday so moderation digest runs
      const restoreDate = mockFridayDate()
      
      try {
        // Mock 5 reports for moderation digest
        const mockReports = Array.from({ length: 5 }, (_, i) => ({
          id: `report-${i + 1}`,
          sale_id: `sale-${i + 1}`,
          reporter_profile_id: `reporter-${i + 1}`,
          reason: 'spam',
          created_at: new Date().toISOString(),
          sales: {
            id: `sale-${i + 1}`,
            title: `Sale ${i + 1}`,
            address: '123 Main St',
            city: 'Test City',
            state: 'KY',
          },
        }))

        mockSendModerationDailyDigestEmail.mockResolvedValue({
          ok: true,
        })

        // Mock reports query for moderation digest - return 5 reports
        mockAdminDb.from.mockImplementation((table: string) => {
          if (table === 'sales') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'sale_reports') {
            return {
              select: vi.fn(() => ({
                gte: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: mockReports,
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'ingestion_city_configs') {
            return ingestionCityConfigsDbMock()
          }
          return { from: vi.fn() }
        })

        const request = new NextRequest('http://localhost/api/cron/daily', {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-cron-secret',
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.tasks.moderationDigest).toBeDefined()
        expect(data.tasks.moderationDigest.ok).toBe(true)
        expect(data.tasks.moderationDigest.reportCount).toBe(5)
      } finally {
        restoreDate()
      }
    })

    it('skips favorites task when emails are disabled', async () => {
      process.env.LOOTAURA_ENABLE_EMAILS = 'false'

      const request = new NextRequest('http://localhost/api/cron/daily', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks.favoritesStartingSoon).toBeDefined()
      expect(data.tasks.favoritesStartingSoon.skipped).toBe(true)
      expect(data.tasks.favoritesStartingSoon.reason).toBe('emails_disabled')
      
      // Verify job processor was not called
      expect(mockProcessFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
    })
  })

  describe('Partial failure behavior', () => {
    beforeEach(() => {
      // Mock archive sales query (no sales to archive)
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsDbMock()
        }
        return { from: vi.fn() }
      })
    })

    it('continues executing remaining tasks when one task fails', async () => {
      // Mock Friday so moderation digest runs
      const restoreDate = mockFridayDate()
      
      try {
        // Mock favorites job to fail
        mockProcessFavoriteSalesStartingSoonJob.mockResolvedValue({
          success: false,
          error: 'Favorites job failed',
        })

        // Mock moderation digest to succeed
        mockSendModerationDailyDigestEmail.mockResolvedValue({
          ok: true,
          reportCount: 0,
        })

        // Mock reports query for moderation digest
        mockAdminDb.from.mockImplementation((table: string) => {
          if (table === 'sales') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'sale_reports') {
            return {
              select: vi.fn(() => ({
                gte: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'ingestion_city_configs') {
            return ingestionCityConfigsDbMock()
          }
          return { from: vi.fn() }
        })

        const request = new NextRequest('http://localhost/api/cron/daily', {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-cron-secret',
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        
        // Archive task should succeed
        expect(data.tasks.archiveSales.ok).toBe(true)
        
        // Favorites task should fail
        expect(data.tasks.favoritesStartingSoon.ok).toBe(false)
        expect(data.tasks.favoritesStartingSoon.error).toBe('Favorites job failed')
        
        // Moderation digest should still execute and succeed
        expect(data.tasks.moderationDigest.ok).toBe(true)
        
        // Overall result should be ok (at least one task succeeded)
        expect(data.ok).toBe(true)
        
        // Verify all tasks were attempted
        expect(mockProcessFavoriteSalesStartingSoonJob).toHaveBeenCalledTimes(1)
        expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledTimes(1)
      } finally {
        restoreDate()
      }
    })

    it('returns ok: false when all tasks fail', async () => {
      // Mock Friday so moderation digest runs
      const restoreDate = mockFridayDate()
      
      try {
        // Mock all tasks to fail
        mockProcessFavoriteSalesStartingSoonJob.mockResolvedValue({
          success: false,
          error: 'Favorites job failed',
        })

        mockSendModerationDailyDigestEmail.mockResolvedValue({
          ok: false,
          error: 'Moderation digest failed',
        })

        mockGeocodePendingSales.mockRejectedValue(new Error('forced geocode failure for test'))

        mockAdminDb.rpc.mockImplementation(async (fn: string) => {
          if (fn === 'count_sales_pending_archive') {
            return {
              data: {
                today_utc_date: '2025-01-15',
                pending_via_ends_at: 0,
                pending_via_legacy: 0,
                published_past_ends_at: 0,
                active_past_ends_at: 0,
                suspicious_ends_before_starts: 0,
              },
              error: null,
            }
          }
          if (fn === 'archive_sales_ended_batch') {
            return Promise.reject(new Error('Archive query failed'))
          }
          return { data: null, error: null }
        })

        // Mock archive sales query to fail (throw error)
        mockAdminDb.from.mockImplementation((table: string) => {
          if (table === 'sales') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'sale_reports') {
            return {
              select: vi.fn(() => ({
                gte: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'ingestion_city_configs') {
            return ingestionCityConfigsDbMock()
          }
          return { from: vi.fn() }
        })

        const request = new NextRequest('http://localhost/api/cron/daily', {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-cron-secret',
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(500)
        expect(data.ok).toBe(false)
        
        // All tasks should have failed
        expect(data.tasks.archiveSales.ok).toBe(false)
        expect(data.tasks.favoritesStartingSoon.ok).toBe(false)
        expect(data.tasks.moderationDigest.ok).toBe(false)
      } finally {
        restoreDate()
      }
    })

    it('handles exceptions in tasks gracefully', async () => {
      // Mock Friday so moderation digest runs
      const restoreDate = mockFridayDate()
      
      try {
        // Mock favorites job to throw
        mockProcessFavoriteSalesStartingSoonJob.mockRejectedValue(
          new Error('Unexpected error in favorites job')
        )

        // Mock moderation digest to succeed
        mockSendModerationDailyDigestEmail.mockResolvedValue({
          ok: true,
          reportCount: 0,
        })

        // Mock reports query for moderation digest
        mockAdminDb.from.mockImplementation((table: string) => {
          if (table === 'sales') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'sale_reports') {
            return {
              select: vi.fn(() => ({
                gte: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            }
          }
          if (table === 'ingestion_city_configs') {
            return ingestionCityConfigsDbMock()
          }
          return { from: vi.fn() }
        })

        const request = new NextRequest('http://localhost/api/cron/daily', {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-cron-secret',
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        
        // Favorites task should have error
        expect(data.tasks.favoritesStartingSoon.ok).toBe(false)
        expect(data.tasks.favoritesStartingSoon.error).toContain('Unexpected error')
        
        // Moderation digest should still succeed
        expect(data.tasks.moderationDigest.ok).toBe(true)
        
        // Overall should be ok (at least one task succeeded)
        expect(data.ok).toBe(true)
      } finally {
        restoreDate()
      }
    })
  })

  describe('GET /api/cron/daily?mode=ingestion', () => {
    let stateTableMock: ReturnType<typeof createIngestionOrchestrationStateTableMock>

    beforeEach(() => {
      process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE = '2'
      process.env.INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS = '45000'
      mockPersistExternalPageSource.mockResolvedValue({
        fetched: 3,
        inserted: 2,
        skipped: 1,
        invalid: 0,
        errors: 0,
        pagesProcessed: 2,
      })
      stateTableMock = createIngestionOrchestrationStateTableMock({})
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceMock()
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })
    })

    it('runs only ingestion orchestration and reports mode ingestion', async () => {
      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.mode).toBe('ingestion')
      expect(data.job).toBe('daily')
      expect(data.tasksRan).toEqual(['ingestionOrchestration'])
      expect(data.tasks.ingestionOrchestration).toBeDefined()
      expect(data.tasks.ingestionOrchestration.ok).toBe(true)
      expect(data.tasks.ingestionOrchestration.steps.native_coordinate_remediation).toMatchObject({
        ok: true,
        claimed: 0,
        promoted: 0,
      })
      expect(data.tasks.ingestionOrchestration.steps.geocode).toMatchObject({
        ok: true,
        claimed: 0,
        succeeded: 0,
        failedRetriable: 0,
        failedTerminal: 0,
        rate429Count: 0,
      })
      expect(mockRunNativeCoordinateRemediation.mock.invocationCallOrder[0]).toBeLessThan(
        mockGeocodePendingSales.mock.invocationCallOrder[0]!
      )
      expect(data.tasks.ingestionOrchestration.steps.publish).toMatchObject({
        ok: true,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      })
      expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
        ok: true,
        adapter: 'external_page_source',
        totalConfigs: 1,
        configsCrawlable: 1,
        configsSkippedNoSourcePages: 0,
        configsSkippedInvalidUrls: 0,
        configsSkippedCrawlExcluded: 0,
        batchSize: 2,
        configsConsumed: 1,
        configsSkippedInvalidPages: 0,
        configsRemaining: 0,
        cursorStart: 0,
        cursorNext: 0,
        executionBudgetMs: 45000,
        executionBudgetExit: false,
        configsProcessed: 1,
        pagesProcessed: 2,
        fetched: 3,
        inserted: 2,
        skipped: 1,
        skippedExpired: 0,
        freshInserted: 0,
        duplicateExistingUrl: 0,
        duplicateCrossCityPage: 0,
        duplicateCanonicalCollision: 0,
        duplicateExpiredRow: 0,
        invalid: 0,
        errors: 0,
        dedupeTelemetrySummary: {
          source_url: 0,
          exact_address_date: 0,
          soft_date_window: 0,
          soft_duplicate_rejected: 0,
          no_match: 0,
          duplicateDecisionTrue: 0,
          duplicateDecisionFalse: 0,
        },
      })
      expect(mockPersistExternalPageSource).toHaveBeenCalledTimes(1)
      expect(mockGeocodePendingSales).toHaveBeenCalledTimes(1)
      expect(mockGeocodePendingSales).toHaveBeenCalledWith(
        expect.objectContaining({
          batchSizeOverride: INGESTION_ORCHESTRATION_DEFAULTS.geocodeBacklogBatchSize,
          concurrencyCeilingOverride: INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling,
          telemetryContext: expect.any(Object),
        })
      )
      expect(mockPublishReadyIngestedSales).toHaveBeenCalledTimes(1)
    })

    it('ingestion geocode step caps GEOCODE_BACKLOG_BATCH_SIZE at 100', async () => {
      process.env.GEOCODE_BACKLOG_BATCH_SIZE = '999'
      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
      expect(mockGeocodePendingSales).toHaveBeenCalledWith(
        expect.objectContaining({
          batchSizeOverride: 100,
          concurrencyCeilingOverride: INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling,
          telemetryContext: expect.any(Object),
        })
      )
    })

    it('acquires lease from clean unlocked null state and proceeds with ingestion', async () => {
      stateTableMock = createIngestionOrchestrationStateTableMock({
        cursor: 0,
        lease_owner: null,
        lease_expires_at: null,
      })
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceMock()
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      // `skipped` on this payload is totals.skipped (count), not the throttle skip flag
      expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
        ok: true,
        configsConsumed: 1,
        configsSkippedInvalidPages: 0,
        configsProcessed: 1,
      })
      expect(mockPersistExternalPageSource).toHaveBeenCalledTimes(1)
      expect(mockGeocodePendingSales).toHaveBeenCalledTimes(1)
      expect(mockPublishReadyIngestedSales).toHaveBeenCalledTimes(1)
    })

    it('skips external ingestion when last successful run is within min interval', async () => {
      const fiveMinutesAgo = new Date(MOCK_BASE_DATE.getTime() - 5 * 60 * 1000).toISOString()
      mockFetchLastSuccessfulExternalIngestionAt.mockResolvedValue(fiveMinutesAgo)

      vi.useFakeTimers({ now: MOCK_BASE_DATE })

      try {
        const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-cron-secret',
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.ok).toBe(true)
        expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
          ok: true,
          skipped: true,
          reason: 'ingestion_interval',
          minIntervalMinutes: 10,
          lastSuccessfulExternalIngestionAt: fiveMinutesAgo,
        })
        expect(mockPersistExternalPageSource).not.toHaveBeenCalled()
        expect(mockGeocodePendingSales).toHaveBeenCalledTimes(1)
        expect(mockPublishReadyIngestedSales).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('prevents overlap when another active orchestration lease exists', async () => {
      const activeLeaseUntil = new Date(Date.now() + 60_000).toISOString()
      stateTableMock = createIngestionOrchestrationStateTableMock({
        cursor: 0,
        lease_owner: 'existing-run-owner',
        lease_expires_at: activeLeaseUntil,
      })
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceMock()
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
        ok: true,
        skipped: true,
        reason: 'active_orchestration_lock',
      })
      expect(mockPersistExternalPageSource).not.toHaveBeenCalled()
      expect(mockGeocodePendingSales).toHaveBeenCalledTimes(1)
      expect(mockPublishReadyIngestedSales).toHaveBeenCalledTimes(1)
    })

    it('recovers stale lease and advances cursor with bounded processing', async () => {
      const staleLeaseUntil = new Date(Date.now() - 60_000).toISOString()
      stateTableMock = createIngestionOrchestrationStateTableMock({
        cursor: 1,
        lease_owner: 'stale-owner',
        lease_expires_at: staleLeaseUntil,
      })
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceRowsMock([
            { city: 'A', state: 'CA', source_platform: 'external_page_source', source_pages: ['https://a.com'] },
            { city: 'B', state: 'CA', source_platform: 'external_page_source', source_pages: ['https://b.com'] },
            { city: 'C', state: 'CA', source_platform: 'external_page_source', source_pages: ['https://c.com'] },
          ])
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
        ok: true,
        totalConfigs: 3,
        batchSize: 2,
        cursorStart: 1,
        cursorNext: 0,
        configsConsumed: 2,
        configsSkippedInvalidPages: 0,
        configsProcessed: 2,
        configsRemaining: 0,
      })
      expect(mockPersistExternalPageSource).toHaveBeenCalledTimes(2)
    })

    it('exits ingestion early on execution budget and remains resumable', async () => {
      // 0 ms = no budget for bounded rows; first loop check exits before any config work (deterministic on fast CI)
      process.env.INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS = '0'
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceRowsMock([
            { city: 'A', state: 'CA', source_platform: 'external_page_source', source_pages: ['https://a.com'] },
            { city: 'B', state: 'CA', source_platform: 'external_page_source', source_pages: ['https://b.com'] },
          ])
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks.ingestionOrchestration.steps.ingestion.executionBudgetExit).toBe(true)
      expect(data.tasks.ingestionOrchestration.steps.ingestion.configsConsumed).toBe(0)
      expect(data.tasks.ingestionOrchestration.steps.ingestion.configsProcessed).toBe(0)
      expect(data.tasks.ingestionOrchestration.steps.ingestion.configsRemaining).toBe(2)
      expect(data.tasks.ingestionOrchestration.steps.ingestion.cursorStart).toBe(
        data.tasks.ingestionOrchestration.steps.ingestion.cursorNext
      )
      expect(mockPersistExternalPageSource).not.toHaveBeenCalled()
      expect(mockGeocodePendingSales).toHaveBeenCalledTimes(1)
      expect(mockPublishReadyIngestedSales).toHaveBeenCalledTimes(1)
    })

    it('does not consume batch slots for empty source_pages placeholders', async () => {
      process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE = '1'
      const rows = [
        {
          city: 'Bad',
          state: 'CA',
          source_platform: 'external_page_source',
          source_pages: [],
        },
        {
          city: 'Good',
          state: 'CA',
          source_platform: 'external_page_source',
          source_pages: ['https://good.example/list'],
        },
      ]
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceRowsMock(rows)
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })
      const response = await GET(request)
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
        totalConfigs: 1,
        configsCrawlable: 1,
        configsSkippedNoSourcePages: 1,
        configsSkippedInvalidUrls: 0,
        configsConsumed: 1,
        configsSkippedInvalidPages: 0,
        configsProcessed: 1,
        cursorStart: 0,
        cursorNext: 0,
        configsRemaining: 0,
      })
      expect(mockPersistExternalPageSource).toHaveBeenCalledTimes(1)
    })

    it('processes only crawlable configs in bounded batch (placeholders excluded from cursor)', async () => {
      process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE = '2'
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceRowsMock([
            {
              city: 'Bad',
              state: 'CA',
              source_platform: 'external_page_source',
              source_pages: [],
            },
            {
              city: 'Good',
              state: 'CA',
              source_platform: 'external_page_source',
              source_pages: ['https://good.example/a'],
            },
            {
              city: 'Later',
              state: 'CA',
              source_platform: 'external_page_source',
              source_pages: ['https://later.example/b'],
            },
          ])
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })
      const response = await GET(request)
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
        totalConfigs: 2,
        configsCrawlable: 2,
        configsSkippedNoSourcePages: 1,
        configsSkippedInvalidUrls: 0,
        configsConsumed: 2,
        configsSkippedInvalidPages: 0,
        configsProcessed: 2,
        cursorStart: 0,
        cursorNext: 0,
        configsRemaining: 0,
      })
      expect(mockPersistExternalPageSource).toHaveBeenCalledTimes(2)
    })

    it('reports many empty placeholders without consuming full batch on crawlable-only cursor', async () => {
      process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE = '20'
      const placeholders = Array.from({ length: 19 }, (_, i) => ({
        city: `Empty${i}`,
        state: 'AL',
        source_platform: 'external_page_source',
        source_pages: [] as string[],
      }))
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceRowsMock([
            ...placeholders,
            {
              city: 'Oak Lawn',
              state: 'IL',
              source_platform: 'external_page_source',
              source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn.html'],
            },
          ])
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret' },
      })
      const response = await GET(request)
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.tasks.ingestionOrchestration.steps.ingestion).toMatchObject({
        totalConfigs: 1,
        configsCrawlable: 1,
        configsSkippedNoSourcePages: 19,
        configsConsumed: 1,
        configsSkippedInvalidPages: 0,
        configsProcessed: 1,
      })
      expect(mockPersistExternalPageSource).toHaveBeenCalledTimes(1)
    })

    it('skips archive, promotions, favorites, and moderation digest', async () => {
      const tablesTouched: string[] = []
      mockAdminDb.from.mockImplementation((table: string) => {
        tablesTouched.push(table)
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsDbMock()
        }
        if (table === 'ingestion_orchestration_state') {
          return stateTableMock
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/daily?mode=ingestion', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.mode).toBe('ingestion')
      expect(data.tasks.archiveSales).toBeUndefined()
      expect(data.tasks.expirePromotions).toBeUndefined()
      expect(data.tasks.favoritesStartingSoon).toBeUndefined()
      expect(data.tasks.moderationDigest).toBeUndefined()
      expect(mockProcessFavoriteSalesStartingSoonJob).not.toHaveBeenCalled()
      expect(mockSendModerationDailyDigestEmail).not.toHaveBeenCalled()
      expect(tablesTouched).toEqual(['ingestion_orchestration_state', 'ingestion_orchestration_state', 'ingestion_orchestration_state', 'ingestion_city_configs', 'ingestion_orchestration_state'])
      expect(mockPersistExternalPageSource).not.toHaveBeenCalled()
    })
  })
})

