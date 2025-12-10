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

// Deterministic base date for all tests: 2025-01-15 12:00:00 UTC
const MOCK_BASE_DATE = new Date('2025-01-15T12:00:00.000Z')

// Helper to create date strings relative to base date
function getDateString(daysOffset: number): string {
  const date = new Date(MOCK_BASE_DATE)
  date.setUTCDate(date.getUTCDate() + daysOffset)
  return date.toISOString().split('T')[0] // YYYY-MM-DD
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
        return { from: vi.fn() }
      })
    })

    it('executes all expected tasks in sequence', async () => {
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
      
      // Verify all tasks are present in response
      expect(data.tasks.archiveSales).toBeDefined()
      expect(data.tasks.favoritesStartingSoon).toBeDefined()
      expect(data.tasks.moderationDigest).toBeDefined()
      
      // Verify job processors were called
      expect(mockProcessFavoriteSalesStartingSoonJob).toHaveBeenCalledTimes(1)
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledTimes(1)
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
        return { from: vi.fn() }
      })
    })

    it('continues executing remaining tasks when one task fails', async () => {
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
    })

    it('returns ok: false when all tasks fail', async () => {
      // Mock all tasks to fail
      mockProcessFavoriteSalesStartingSoonJob.mockResolvedValue({
        success: false,
        error: 'Favorites job failed',
      })

      mockSendModerationDailyDigestEmail.mockResolvedValue({
        ok: false,
        error: 'Moderation digest failed',
      })

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
    })

    it('handles exceptions in tasks gracefully', async () => {
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
    })
  })
})

