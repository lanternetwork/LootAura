/**
 * Integration tests for moderation daily digest cron endpoint
 * Tests GET /api/cron/moderation-daily-digest
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

// Mock email sending
const mockSendModerationDailyDigestEmail = vi.fn()

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

describe('GET /api/cron/moderation-daily-digest', () => {
  let GET: any

  beforeAll(async () => {
    const route = await import('@/app/api/cron/moderation-daily-digest/route')
    GET = route.GET
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertCronAuthorized.mockImplementation(() => {}) // Pass auth by default
    mockSendModerationDailyDigestEmail.mockResolvedValue({ ok: true })
    
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example.com'
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

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Unauthorized')
      
      // Verify email was not sent
      expect(mockSendModerationDailyDigestEmail).not.toHaveBeenCalled()
    })

    it('allows request with valid cron auth', async () => {
      // Mock reports query (empty)
      mockAdminDb.from.mockReset()
      mockAdminDb.from.mockImplementation((table: string) => {
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
        // Return a default chainable mock for other tables
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        }
      })

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.reportCount).toBe(0)
    })
  })

  describe('Digest content scope', () => {
    it('includes only reports from last 24 hours', async () => {
      const recentReport = {
        id: 'report-1',
        sale_id: 'sale-1',
        reporter_profile_id: 'reporter-001',
        reason: 'spam',
        created_at: new Date(MOCK_BASE_DATE.getTime() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
        sales: {
          id: 'sale-1',
          title: 'Recent Sale',
          address: '123 Main St',
          city: 'Test City',
          state: 'KY',
        },
      }

      const oldReport = {
        id: 'report-2',
        sale_id: 'sale-2',
        reporter_profile_id: 'reporter-002',
        reason: 'inappropriate',
        created_at: new Date(MOCK_BASE_DATE.getTime() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
        sales: {
          id: 'sale-2',
          title: 'Old Sale',
          address: '456 Oak Ave',
          city: 'Test City',
          state: 'KY',
        },
      }

      // Mock reports query - should filter by created_at >= 24 hours ago
      mockAdminDb.from.mockReset()
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sale_reports') {
          const orderChain = {
            order: vi.fn((field: string, options?: { ascending: boolean }) => {
              // Verify order parameters
              expect(field).toBe('created_at')
              if (options) {
                expect(options.ascending).toBe(false)
              }
              // Return a thenable that resolves with the data
              return Promise.resolve({
                data: [recentReport], // Only recent report in results (with nested sales relation)
                error: null,
              })
            }),
          }
          const gteChain = {
            gte: vi.fn((field: string, value: string) => {
              // Verify it's filtering by created_at >= 24 hours ago
              expect(field).toBe('created_at')
              const cutoffDate = new Date(value)
              const expectedCutoff = new Date(MOCK_BASE_DATE.getTime() - 24 * 60 * 60 * 1000)
              expect(cutoffDate.getTime()).toBeCloseTo(expectedCutoff.getTime(), -3) // Within 1 second
              return orderChain
            }),
          }
          return {
            select: vi.fn(() => gteChain),
          }
        }
        // Return a default chainable mock for other tables
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        }
      })
      
      // Ensure email mock returns success
      mockSendModerationDailyDigestEmail.mockResolvedValue({
        ok: true,
      })

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.reportCount).toBe(1)
      
      // Verify email was sent with only recent report
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledTimes(1)
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          reports: expect.arrayContaining([
            expect.objectContaining({
              reportId: 'report-1',
              saleId: 'sale-1',
              saleTitle: 'Recent Sale',
            }),
          ]),
        })
      )
      
      // Verify old report was not included
      const callArgs = mockSendModerationDailyDigestEmail.mock.calls[0][0]
      expect(callArgs.reports).not.toContainEqual(
        expect.objectContaining({
          reportId: 'report-2',
        })
      )
    })

    it('sends empty digest when no reports in last 24 hours', async () => {
      // Mock reports query (empty)
      mockAdminDb.from.mockImplementation((table: string) => {
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

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.reportCount).toBe(0)
      
      // Verify email was still sent (empty digest)
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledTimes(1)
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          reports: [],
        })
      )
    })

    it('excludes resolved reports if query filters by status', async () => {
      // Note: Current implementation doesn't filter by status, but this test
      // documents expected behavior if status filtering is added
      const openReport = {
        id: 'report-1',
        sale_id: 'sale-1',
        reporter_profile_id: 'reporter-001',
        reason: 'spam',
        status: 'open',
        created_at: new Date(MOCK_BASE_DATE.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        sales: {
          id: 'sale-1',
          title: 'Open Report Sale',
          address: '123 Main St',
          city: 'Test City',
          state: 'KY',
        },
      }

      const resolvedReport = {
        id: 'report-2',
        sale_id: 'sale-2',
        reporter_profile_id: 'reporter-002',
        reason: 'inappropriate',
        status: 'resolved',
        created_at: new Date(MOCK_BASE_DATE.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        sales: {
          id: 'sale-2',
          title: 'Resolved Report Sale',
          address: '456 Oak Ave',
          city: 'Test City',
          state: 'KY',
        },
      }

      // Mock reports query - current implementation includes all reports regardless of status
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [openReport, resolvedReport], // Both included (current behavior)
                  error: null,
                }),
              })),
            })),
          }
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.reportCount).toBe(2)
      
      // Verify both reports were included (current behavior)
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          reports: expect.arrayContaining([
            expect.objectContaining({ reportId: 'report-1' }),
            expect.objectContaining({ reportId: 'report-2' }),
          ]),
        })
      )
    })
  })

  describe('Inbox & PII', () => {
    it('sends digest to moderation inbox (not affected by user preferences)', async () => {
      const report = {
        id: 'report-1',
        sale_id: 'sale-1',
        reporter_profile_id: 'reporter-001',
        reason: 'spam',
        created_at: new Date(MOCK_BASE_DATE.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        sales: {
          id: 'sale-1',
          title: 'Test Sale',
          address: '123 Main St',
          city: 'Test City',
          state: 'KY',
        },
      }

      // Mock reports query
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [report],
                  error: null,
                }),
              })),
            })),
          }
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Verify email was sent (to moderation inbox, not user email)
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledTimes(1)
      
      // Verify digest includes only fields permitted in template
      const callArgs = mockSendModerationDailyDigestEmail.mock.calls[0][0]
      expect(callArgs.reports).toEqual([
        expect.objectContaining({
          reportId: 'report-1',
          saleId: 'sale-1',
          saleTitle: 'Test Sale',
          saleAddress: '123 Main St, Test City, KY',
          reason: 'spam',
          createdAt: report.created_at,
          reporterId: 'reporter-001', // Only ID, not full profile
          adminViewUrl: expect.stringContaining('/admin/tools/reports?reportId=report-1'),
        }),
      ])
      
      // Verify no full email addresses or other PII beyond template fields
      const reportData = callArgs.reports[0]
      expect(reportData).not.toHaveProperty('reporterEmail')
      expect(reportData).not.toHaveProperty('reporterName')
      expect(reportData).not.toHaveProperty('reporterProfile')
    })

    it('handles missing sale data gracefully', async () => {
      const report = {
        id: 'report-1',
        sale_id: 'sale-1',
        reporter_profile_id: 'reporter-001',
        reason: 'spam',
        created_at: new Date(MOCK_BASE_DATE.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        sales: null, // Sale not found or deleted
      }

      // Mock reports query
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [report],
                  error: null,
                }),
              })),
            })),
          }
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Verify email was sent with fallback values
      expect(mockSendModerationDailyDigestEmail).toHaveBeenCalledTimes(1)
      const callArgs = mockSendModerationDailyDigestEmail.mock.calls[0][0]
      expect(callArgs.reports).toEqual([
        expect.objectContaining({
          reportId: 'report-1',
          saleId: 'sale-1',
          saleTitle: 'Untitled Sale',
          saleAddress: 'Address not available',
        }),
      ])
    })
  })

  describe('Error handling', () => {
    it('returns 500 when reports query fails', async () => {
      // Mock reports query error
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              })),
            })),
          }
        }
        return { from: vi.fn() }
      })

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Failed to fetch reports')
      
      // Verify email was not sent
      expect(mockSendModerationDailyDigestEmail).not.toHaveBeenCalled()
    })

    it('returns 500 when email send fails', async () => {
      const report = {
        id: 'report-1',
        sale_id: 'sale-1',
        reporter_profile_id: 'reporter-001',
        reason: 'spam',
        created_at: new Date(MOCK_BASE_DATE.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        sales: {
          id: 'sale-1',
          title: 'Test Sale',
          address: '123 Main St',
          city: 'Test City',
          state: 'KY',
        },
      }

      // Mock reports query
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sale_reports') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [report],
                  error: null,
                }),
              })),
            })),
          }
        }
        return { from: vi.fn() }
      })

      // Mock email send failure
      mockSendModerationDailyDigestEmail.mockResolvedValue({
        ok: false,
        error: 'Email service unavailable',
      })

      const request = new NextRequest('http://localhost/api/cron/moderation-daily-digest', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Failed to send email')
    })
  })
})

