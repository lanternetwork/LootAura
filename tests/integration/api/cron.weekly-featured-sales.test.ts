/**
 * Integration tests for weekly featured sales cron endpoint and job
 * Tests cron auth, safety gates, correctness, and opt-out behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { processWeeklyFeaturedSalesJob } from '@/lib/jobs/processor'
import { sendFeaturedSalesEmail } from '@/lib/email/featuredSales'
import { selectFeaturedSales, getWeekKey } from '@/lib/featured-email/selection'
import { getPrimaryZip } from '@/lib/data/zipUsage'
import { recordInclusions } from '@/lib/featured-email/inclusionTracking'

// Mock dependencies
const mockFromBase = vi.fn()
const mockAdminDb = vi.fn()
const mockAuthUsersQuery = vi.fn()
const mockSelectFeaturedSales = vi.fn()
const mockGetPrimaryZip = vi.fn()
const mockSendFeaturedSalesEmail = vi.fn()
const mockRecordInclusions = vi.fn()

// Mock cron auth
vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => mockFromBase(db, table),
}))

vi.mock('@/lib/featured-email/selection', () => ({
  selectFeaturedSales: (...args: any[]) => mockSelectFeaturedSales(...args),
  getWeekKey: (...args: any[]) => {
    const { getWeekKey: realGetWeekKey } = require('@/lib/featured-email/selection')
    return realGetWeekKey(...args)
  },
}))

vi.mock('@/lib/data/zipUsage', () => ({
  getPrimaryZip: (...args: any[]) => mockGetPrimaryZip(...args),
}))

vi.mock('@/lib/email/featuredSales', () => ({
  sendFeaturedSalesEmail: (...args: any[]) => mockSendFeaturedSalesEmail(...args),
  convertSaleToFeaturedItem: (sale: any) => ({
    saleId: sale.id,
    saleTitle: sale.title,
    saleAddress: sale.address_line1 || undefined,
    dateRange: sale.date_start,
    saleUrl: `https://lootaura.com/s/${sale.id}`,
  }),
}))

vi.mock('@/lib/featured-email/inclusionTracking', () => ({
  recordInclusions: (...args: any[]) => mockRecordInclusions(...args),
}))

vi.mock('@/lib/data/profileAccess', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ display_name: 'Test User' }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        listUsers: mockAuthUsersQuery,
      },
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: { display_name: 'Test User' }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: { display_name: 'Test User' }, error: null })),
  }),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  generateOperationId: () => 'test-op-id',
}))

// Deterministic base date for all tests: 2025-01-16 12:00:00 UTC (Thursday)
const MOCK_BASE_DATE = new Date('2025-01-16T12:00:00.000Z')

describe('Weekly Featured Sales Cron Job', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_BASE_DATE)
    
    // Default mocks
    mockAuthUsersQuery.mockResolvedValue({
      data: { users: [] },
      error: null,
    })
    
    mockFromBase.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })
    
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.FEATURED_EMAIL_ENABLED = 'true'
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
    process.env.FEATURED_EMAIL_SEND_MODE = 'compute-only'
    process.env.FEATURED_EMAIL_ALLOWLIST = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Safety gates', () => {
    it('returns success with skipped=true when FEATURED_EMAIL_ENABLED=false', async () => {
      process.env.FEATURED_EMAIL_ENABLED = 'false'
      
      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'compute-only',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(result.emailsSent).toBe(0)
      expect(result.recipientsProcessed).toBe(0)
    })

    it('skips when compute-only mode with empty allowlist', async () => {
      process.env.FEATURED_EMAIL_ENABLED = 'true'
      process.env.FEATURED_EMAIL_SEND_MODE = 'compute-only'
      process.env.FEATURED_EMAIL_ALLOWLIST = ''
      
      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'compute-only',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(result.emailsSent).toBe(0)
      expect(result.recipientsProcessed).toBe(0)
    })

    it('processes allowlisted recipients in allowlist-send mode', async () => {
      const userId = 'user-1'
      const userEmail = 'user1@example.test'
      
      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [{
            id: userId,
            email: userEmail,
          }],
        },
        error: null,
      })

      mockFromBase.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: userId,
                email_featured_weekly_enabled: true,
                email_favorites_digest_enabled: true,
                email_seller_weekly_enabled: true,
              }],
              error: null,
            }),
          }),
        }),
      })

      mockGetPrimaryZip.mockResolvedValue('40204')
      
      const selectedSales = Array.from({ length: 12 }, (_, i) => `sale-${i + 1}`)
      mockSelectFeaturedSales.mockResolvedValue({
        selectedSales,
      })

      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: selectedSales.map((id, i) => ({
                id,
                title: `Sale ${i + 1}`,
                date_start: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                date_end: null,
                address_line1: `Address ${i + 1}`,
                address_city: 'Louisville',
                address_region: 'KY',
                cover_image_url: null,
                status: 'published',
              })),
              error: null,
            }),
          }),
        }),
      })

      mockSendFeaturedSalesEmail.mockResolvedValue({ ok: true })
      mockRecordInclusions.mockResolvedValue({ success: true })

      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'allowlist-send',
        allowlist: [userEmail],
      })

      expect(result.success).toBe(true)
      expect(result.emailsSent).toBe(1)
      expect(mockSendFeaturedSalesEmail).toHaveBeenCalledTimes(1)
      expect(mockRecordInclusions).toHaveBeenCalled()
    })
  })

  describe('Recipient selection', () => {
    it('excludes users with email_featured_weekly_enabled=false', async () => {
      const userId = 'user-1'
      const userEmail = 'user1@example.test'
      
      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [{
            id: userId,
            email: userEmail,
          }],
        },
        error: null,
      })

      mockFromBase.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: userId,
                email_featured_weekly_enabled: false, // Disabled
                email_favorites_digest_enabled: true,
                email_seller_weekly_enabled: true,
              }],
              error: null,
            }),
          }),
        }),
      })

      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'full-send',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(result.emailsSent).toBe(0)
      expect(mockSendFeaturedSalesEmail).not.toHaveBeenCalled()
    })

    it('excludes fully unsubscribed users', async () => {
      const userId = 'user-1'
      const userEmail = 'user1@example.test'
      
      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [{
            id: userId,
            email: userEmail,
          }],
        },
        error: null,
      })

      mockFromBase.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: userId,
                email_featured_weekly_enabled: true,
                email_favorites_digest_enabled: false, // Unsubscribed
                email_seller_weekly_enabled: false, // Unsubscribed
              }],
              error: null,
            }),
          }),
        }),
      })

      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'full-send',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(result.emailsSent).toBe(0)
      expect(mockSendFeaturedSalesEmail).not.toHaveBeenCalled()
    })

    it('includes users with email_featured_weekly_enabled=true and at least one other preference enabled', async () => {
      const userId = 'user-1'
      const userEmail = 'user1@example.test'
      
      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [{
            id: userId,
            email: userEmail,
          }],
        },
        error: null,
      })

      mockFromBase.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: userId,
                email_featured_weekly_enabled: true,
                email_favorites_digest_enabled: true, // Not fully unsubscribed
                email_seller_weekly_enabled: false,
              }],
              error: null,
            }),
          }),
        }),
      })

      mockGetPrimaryZip.mockResolvedValue('40204')
      
      const selectedSales = Array.from({ length: 12 }, (_, i) => `sale-${i + 1}`)
      mockSelectFeaturedSales.mockResolvedValue({
        selectedSales,
      })

      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: selectedSales.map((id, i) => ({
                id,
                title: `Sale ${i + 1}`,
                date_start: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                date_end: null,
                address_line1: `Address ${i + 1}`,
                address_city: 'Louisville',
                address_region: 'KY',
                cover_image_url: null,
                status: 'published',
              })),
              error: null,
            }),
          }),
        }),
      })

      mockSendFeaturedSalesEmail.mockResolvedValue({ ok: true })
      mockRecordInclusions.mockResolvedValue({ success: true })

      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'full-send',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(result.emailsSent).toBe(1)
      expect(mockSendFeaturedSalesEmail).toHaveBeenCalledTimes(1)
    })

    it('skips users without primary ZIP', async () => {
      const userId = 'user-1'
      const userEmail = 'user1@example.test'
      
      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [{
            id: userId,
            email: userEmail,
          }],
        },
        error: null,
      })

      mockFromBase.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: userId,
                email_featured_weekly_enabled: true,
                email_favorites_digest_enabled: true,
                email_seller_weekly_enabled: true,
              }],
              error: null,
            }),
          }),
        }),
      })

      mockGetPrimaryZip.mockResolvedValue(null) // No primary ZIP

      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'full-send',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(result.emailsSent).toBe(0)
      expect(mockSendFeaturedSalesEmail).not.toHaveBeenCalled()
    })
  })

  describe('Correctness', () => {
    it('generates exactly 12 sales per recipient', async () => {
      const userId = 'user-1'
      const userEmail = 'user1@example.test'
      
      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [{
            id: userId,
            email: userEmail,
          }],
        },
        error: null,
      })

      mockFromBase.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: userId,
                email_featured_weekly_enabled: true,
                email_favorites_digest_enabled: true,
                email_seller_weekly_enabled: true,
              }],
              error: null,
            }),
          }),
        }),
      })

      mockGetPrimaryZip.mockResolvedValue('40204')
      
      const selectedSales = Array.from({ length: 12 }, (_, i) => `sale-${i + 1}`)
      mockSelectFeaturedSales.mockResolvedValue({
        selectedSales,
      })

      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: selectedSales.map((id, i) => ({
                id,
                title: `Sale ${i + 1}`,
                date_start: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                date_end: null,
                address_line1: `Address ${i + 1}`,
                address_city: 'Louisville',
                address_region: 'KY',
                cover_image_url: null,
                status: 'published',
              })),
              error: null,
            }),
          }),
        }),
      })

      mockSendFeaturedSalesEmail.mockResolvedValue({ ok: true })
      mockRecordInclusions.mockResolvedValue({ success: true })

      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'full-send',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(mockSelectFeaturedSales).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientProfileId: userId,
          primaryZip: '40204',
        })
      )
      expect(mockSendFeaturedSalesEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          sales: expect.arrayContaining([
            expect.objectContaining({ saleId: expect.any(String) }),
          ]),
        })
      )
      const emailCall = mockSendFeaturedSalesEmail.mock.calls[0][0]
      expect(emailCall.sales.length).toBe(12)
    })

    it('records inclusion tracking when email is sent', async () => {
      const userId = 'user-1'
      const userEmail = 'user1@example.test'
      
      mockAuthUsersQuery.mockResolvedValue({
        data: {
          users: [{
            id: userId,
            email: userEmail,
          }],
        },
        error: null,
      })

      mockFromBase.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: userId,
                email_featured_weekly_enabled: true,
                email_favorites_digest_enabled: true,
                email_seller_weekly_enabled: true,
              }],
              error: null,
            }),
          }),
        }),
      })

      mockGetPrimaryZip.mockResolvedValue('40204')
      
      const selectedSales = Array.from({ length: 12 }, (_, i) => `sale-${i + 1}`)
      mockSelectFeaturedSales.mockResolvedValue({
        selectedSales,
      })

      mockFromBase.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: selectedSales.map((id, i) => ({
                id,
                title: `Sale ${i + 1}`,
                date_start: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                date_end: null,
                address_line1: `Address ${i + 1}`,
                address_city: 'Louisville',
                address_region: 'KY',
                cover_image_url: null,
                status: 'published',
              })),
              error: null,
            }),
          }),
        }),
      })

      mockSendFeaturedSalesEmail.mockResolvedValue({ ok: true })
      mockRecordInclusions.mockResolvedValue({ success: true })

      const result = await processWeeklyFeaturedSalesJob({
        sendMode: 'full-send',
        allowlist: [],
      })

      expect(result.success).toBe(true)
      expect(mockRecordInclusions).toHaveBeenCalled()
      const inclusionsCall = mockRecordInclusions.mock.calls[0][0]
      expect(inclusionsCall.length).toBe(12)
      expect(inclusionsCall[0]).toMatchObject({
        saleId: expect.any(String),
        recipientProfileId: userId,
        weekKey: expect.any(String),
      })
    })
  })
})

describe('GET /api/cron/weekly-featured-sales', () => {
  let handler: (request: NextRequest) => Promise<Response>
  let assertCronAuthorized: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Import the handler dynamically after mocks are set up
    const module = await import('@/app/api/cron/weekly-featured-sales/route')
    handler = module.GET
    
    const cronAuth = await import('@/lib/auth/cron')
    assertCronAuthorized = vi.mocked(cronAuth.assertCronAuthorized)
    
    // Set default env vars for tests
    process.env.FEATURED_EMAIL_ENABLED = 'true'
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
    process.env.FEATURED_EMAIL_SEND_MODE = 'compute-only'
    process.env.FEATURED_EMAIL_ALLOWLIST = ''
  })

  it('should return 401 when Authorization header is missing', async () => {
    const request = new NextRequest('http://localhost/api/cron/weekly-featured-sales', {
      method: 'GET',
    })

    // Mock auth failure (throws NextResponse)
    const { NextResponse } = await import('next/server')
    assertCronAuthorized.mockImplementation(() => {
      throw NextResponse.json(
        { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Unauthorized')
    expect(processWeeklyFeaturedSalesJob).not.toHaveBeenCalled()
  })

  it('should return skipped when FEATURED_EMAIL_ENABLED=false', async () => {
    process.env.FEATURED_EMAIL_ENABLED = 'false'
    
    const request = new NextRequest('http://localhost/api/cron/weekly-featured-sales', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.skipped).toBe(true)
    expect(data.featuredEmailEnabled).toBe(false)
    expect(processWeeklyFeaturedSalesJob).not.toHaveBeenCalled()
  })

  it('should accept GET requests and trigger job when authorized and enabled', async () => {
    const request = new NextRequest('http://localhost/api/cron/weekly-featured-sales', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
      },
    })

    assertCronAuthorized.mockImplementation(() => {})
    vi.mocked(processWeeklyFeaturedSalesJob).mockResolvedValue({
      success: true,
      emailsSent: 0,
      errors: 0,
      recipientsProcessed: 0,
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.job).toBe('weekly-featured-sales')
    expect(processWeeklyFeaturedSalesJob).toHaveBeenCalledTimes(1)
  })
})

