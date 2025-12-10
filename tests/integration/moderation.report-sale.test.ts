/**
 * Integration tests for sale reporting and auto-hide threshold
 * Tests POST /api/sales/[id]/report
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
  },
  from: vi.fn(),
}

// Mock admin DB and query chains
const mockReportChain = {
  select: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}

const mockSaleChain = {
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}

const mockAdminDb = {
  from: vi.fn((table: string) => {
    if (table === 'sale_reports') return mockReportChain
    if (table === 'sales') return mockSaleChain
    return mockReportChain
  }),
}

const mockRlsDb = {
  from: vi.fn((table: string) => {
    if (table === 'sales_v2') return mockSaleChain
    return mockSaleChain
  }),
}

// Create query chain for profile lookups (account lock checks)
const createQueryChain = () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: { is_locked: false }, error: null })),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => db.from(table),
}))

// Mock CSRF validation
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual('@/lib/csrf')
  return {
    ...actual,
    requireCsrfToken: (request: Request) => {
      const tokenFromHeader = request.headers.get('x-csrf-token')
      const cookieHeader = request.headers.get('cookie')
      let tokenFromCookie: string | null = null
      
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim())
        for (const cookie of cookies) {
          const equalIndex = cookie.indexOf('=')
          if (equalIndex === -1) continue
          const name = cookie.substring(0, equalIndex).trim()
          const value = cookie.substring(equalIndex + 1).trim()
          if (name === 'csrf-token') {
            tokenFromCookie = decodeURIComponent(value)
            break
          }
        }
      }
      
      if (!tokenFromHeader || !tokenFromCookie) {
        return false
      }
      
      return tokenFromHeader === tokenFromCookie
    },
  }
})

// Mock rate limiting - allow all requests by default
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn().mockResolvedValue({ 
    allowed: true, 
    remaining: 10,
    softLimited: false,
    resetAt: Date.now() + 60000,
  }),
}))

vi.mock('@/lib/rateLimit/keys', () => ({
  deriveKey: vi.fn().mockResolvedValue('test-key'),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  generateOperationId: vi.fn(() => 'test-op-id-123'),
}))

// Helper function to create a request with CSRF token
function createRequestWithCsrf(
  url: string,
  body: any,
  options: { csrfToken?: string | null } = {}
): NextRequest {
  const { csrfToken = generateCsrfToken() } = options
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken
    headers['cookie'] = `csrf-token=${csrfToken}`
  }
  
  return new NextRequest(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers,
  } as any)
}

describe('POST /api/sales/[id]/report', () => {
  let POST: any
  const saleId = 'test-sale-id'
  const userId = 'test-user-id'
  const ownerId = 'owner-user-id'
  
  beforeAll(async () => {
    const route = await import('@/app/api/sales/[id]/report/route')
    POST = route.POST
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
    
    // Reset chain mocks
    mockReportChain.select.mockReturnValue(mockReportChain)
    mockReportChain.insert.mockReturnValue(mockReportChain)
    mockReportChain.eq.mockReturnValue(mockReportChain)
    mockReportChain.gte.mockReturnValue(mockReportChain)
    mockSaleChain.select.mockReturnValue(mockSaleChain)
    mockSaleChain.update.mockReturnValue(mockSaleChain)
    mockSaleChain.eq.mockReturnValue(mockSaleChain)
    
    // Default sale lookup (visible sale)
    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: saleId,
                  owner_id: ownerId,
                  title: 'Test Sale',
                },
                error: null,
              }),
            })),
          })),
        }
      }
      return mockSaleChain
    })
  })

  describe('Report creation', () => {
    it('creates a report for a visible sale', async () => {
      // Mock no existing report
      mockReportChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })
      
      // Mock successful report insert
      mockReportChain.single.mockResolvedValue({
        data: { id: 'report-id-1' },
        error: null,
      })
      
      // Mock recent reports query (for auto-hide check) - return empty initially
      mockReportChain.select.mockImplementation((fields: string) => {
        if (fields === 'reporter_profile_id') {
          return {
            eq: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({
                data: [{ reporter_profile_id: userId }],
                error: null,
              }),
            })),
          }
        }
        return mockReportChain
      })
      
      // Mock sale status check (for auto-hide)
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { moderation_status: 'visible' },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          }
        }
        return mockReportChain
      })

      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam', details: 'Test report' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.reported).toBe(true)
      
      // Verify report was inserted
      expect(mockReportChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          sale_id: saleId,
          reporter_profile_id: userId,
          reason: 'spam',
          details: 'Test report',
          status: 'open',
        })
      )
    })

    it('prevents self-reporting', async () => {
      // Mock sale owned by same user
      mockRlsDb.from.mockImplementation((table: string) => {
        if (table === 'sales_v2') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: saleId,
                    owner_id: userId, // Same as reporter
                    title: 'Test Sale',
                  },
                  error: null,
                }),
              })),
            })),
          }
        }
        return mockSaleChain
      })

      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.reported).toBe(true)
      
      // Verify no report was inserted
      expect(mockReportChain.insert).not.toHaveBeenCalled()
    })
  })

  describe('Duplicate report prevention', () => {
    it('prevents duplicate reports from same user within 24h', async () => {
      // Mock existing report
      mockReportChain.maybeSingle.mockResolvedValue({
        data: { id: 'existing-report-id' },
        error: null,
      })

      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam', details: 'Duplicate' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.reported).toBe(true)
      
      // Verify no new report was inserted
      expect(mockReportChain.insert).not.toHaveBeenCalled()
    })
  })

  describe('Auto-hide threshold', () => {
    it('auto-hides sale when threshold of unique reporters is reached', async () => {
      // Mock no existing report
      mockReportChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })
      
      // Mock successful report insert
      mockReportChain.single.mockResolvedValue({
        data: { id: 'report-id-1' },
        error: null,
      })
      
      // Mock recent reports query returning 5 unique reporters (threshold)
      const uniqueReporters = [
        { reporter_profile_id: 'user-1' },
        { reporter_profile_id: 'user-2' },
        { reporter_profile_id: 'user-3' },
        { reporter_profile_id: 'user-4' },
        { reporter_profile_id: userId }, // Current reporter makes 5
      ]
      
      mockReportChain.select.mockImplementation((fields: string) => {
        if (fields === 'reporter_profile_id') {
          return {
            eq: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({
                data: uniqueReporters,
                error: null,
              }),
            })),
          }
        }
        return mockReportChain
      })
      
      // Mock sale status check - not yet hidden
      let saleUpdateCalled = false
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { moderation_status: 'visible' },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => {
              saleUpdateCalled = true
              return {
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }
            }),
          }
        }
        return mockReportChain
      })

      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      
      // Verify sale was updated to hidden_by_admin
      expect(saleUpdateCalled).toBe(true)
    })

    it('does not auto-hide if threshold not reached', async () => {
      // Mock no existing report
      mockReportChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })
      
      // Mock successful report insert
      mockReportChain.single.mockResolvedValue({
        data: { id: 'report-id-1' },
        error: null,
      })
      
      // Mock recent reports query returning only 2 unique reporters (below threshold)
      mockReportChain.select.mockImplementation((fields: string) => {
        if (fields === 'reporter_profile_id') {
          return {
            eq: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({
                data: [
                  { reporter_profile_id: 'user-1' },
                  { reporter_profile_id: userId },
                ],
                error: null,
              }),
            })),
          }
        }
        return mockReportChain
      })
      
      // Mock sale status check
      let saleUpdateCalled = false
      mockAdminDb.from.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { moderation_status: 'visible' },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => {
              saleUpdateCalled = true
              return {
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }
            }),
          }
        }
        return mockReportChain
      })

      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      
      // Verify sale was NOT updated (threshold not reached)
      expect(saleUpdateCalled).toBe(false)
    })
  })

  describe('CSRF enforcement', () => {
    it('rejects POST without CSRF token', async () => {
      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam' },
        { csrfToken: null }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('CSRF_INVALID')
    })
  })

  describe('Rate limiting', () => {
    it('enforces rate limits on reporting', async () => {
      const { check } = await import('@/lib/rateLimit/limiter')
      vi.mocked(check).mockResolvedValue({
        allowed: false,
        remaining: 0,
        softLimited: false,
        resetAt: Date.now() + 60000,
      })

      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('RATE_LIMIT_EXCEEDED')
    })
  })

  describe('Error handling', () => {
    it('returns 404 for non-existent sale', async () => {
      mockRlsDb.from.mockImplementation((table: string) => {
        if (table === 'sales_v2') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            })),
          }
        }
        return mockSaleChain
      })

      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { reason: 'spam' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('SALE_NOT_FOUND')
    })

    it('returns 400 for invalid request body', async () => {
      const request = createRequestWithCsrf(
        `http://localhost/api/sales/${saleId}/report`,
        { invalid: 'data' }
      )

      const response = await POST(request, { params: { id: saleId } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('VALIDATION_ERROR')
    })
  })
})

