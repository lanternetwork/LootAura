/**
 * Integration tests for daily cron orchestration
 * Tests GET /api/cron/daily endpoint that orchestrates multiple tasks
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock cron auth
const mockAssertCronAuthorized = vi.fn()

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: (...args: any[]) => mockAssertCronAuthorized(...args),
}))

// Mock admin DB
const mockAdminDb = {
  from: vi.fn(),
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

const { mockGeocodePendingSales, mockPublishReadyIngestedSales } = vi.hoisted(() => ({
  mockGeocodePendingSales: vi.fn(),
  mockPublishReadyIngestedSales: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  geocodePendingSales: (...args: unknown[]) => mockGeocodePendingSales(...args),
}))

vi.mock('@/lib/ingestion/publishWorker', () => ({
  publishReadyIngestedSales: (...args: unknown[]) => mockPublishReadyIngestedSales(...args),
}))

vi.mock('@/lib/ingestion/orchestrationMetrics', () => ({
  recordIngestionOrchestrationRun: vi.fn().mockResolvedValue(undefined),
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

describe('GET /api/cron/daily', () => {
  let GET: any

  beforeAll(async () => {
    const route = await import('@/app/api/cron/daily/route')
    GET = route.GET
  })

  beforeEach(() => {
    vi.clearAllMocks()
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
    mockPublishReadyIngestedSales.mockResolvedValue({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    })
    mockPersistExternalPageSource.mockResolvedValue({
      fetched: 0,
      inserted: 0,
      skipped: 0,
      invalid: 0,
      errors: 0,
      pagesProcessed: 0,
    })

    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
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

        // Mock archive sales query to fail (throw error)
        mockAdminDb.from.mockImplementation((table: string) => {
          if (table === 'sales') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  is: vi.fn().mockRejectedValue(new Error('Archive query failed')),
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
    beforeEach(() => {
      mockPersistExternalPageSource.mockResolvedValue({
        fetched: 3,
        inserted: 2,
        skipped: 1,
        invalid: 0,
        errors: 0,
        pagesProcessed: 2,
      })
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsExternalPageSourceMock()
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
      expect(data.tasks.ingestionOrchestration.steps.geocode).toMatchObject({
        ok: true,
        claimed: 0,
        succeeded: 0,
        failedRetriable: 0,
        failedTerminal: 0,
        rate429Count: 0,
      })
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
        configsProcessed: 1,
        pagesProcessed: 2,
        fetched: 3,
        inserted: 2,
        skipped: 1,
        invalid: 0,
        errors: 0,
      })
      expect(mockPersistExternalPageSource).toHaveBeenCalledTimes(1)
      expect(mockGeocodePendingSales).toHaveBeenCalledTimes(1)
      expect(mockPublishReadyIngestedSales).toHaveBeenCalledTimes(1)
    })

    it('skips archive, promotions, favorites, and moderation digest', async () => {
      const tablesTouched: string[] = []
      mockAdminDb.from.mockImplementation((table: string) => {
        tablesTouched.push(table)
        if (table === 'ingestion_city_configs') {
          return ingestionCityConfigsDbMock()
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
      expect(tablesTouched).toEqual(['ingestion_city_configs'])
      expect(mockPersistExternalPageSource).not.toHaveBeenCalled()
    })
  })
})

