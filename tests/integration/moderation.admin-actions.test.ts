/**
 * Integration tests for admin report actions
 * Tests GET /api/admin/reports and PATCH /api/admin/reports/[id]
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock admin gate
const mockAssertAdminOrThrow = vi.fn()

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: any[]) => mockAssertAdminOrThrow(...args),
}))

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-user-id', email: 'admin@example.com' } }, error: null }),
  },
}

// Mock admin DB and query chains
const mockReportChain = {
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}

const mockSaleChain = {
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}

const mockProfileChain = {
  update: vi.fn(),
  eq: vi.fn(),
}

const mockAdminDb = {
  from: vi.fn((table: string) => {
    if (table === 'sale_reports') return mockReportChain
    if (table === 'sales') return mockSaleChain
    if (table === 'profiles') return mockProfileChain
    return mockReportChain
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => db.from(table),
}))

// Mock rate limiting - use deterministic timestamp
// Base time: 2025-01-15 12:00:00 UTC
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn().mockResolvedValue({ 
    allowed: true, 
    remaining: 10,
    softLimited: false,
    resetAt: 1736942400000 + 60000, // 2025-01-15 12:00:00 UTC + 60s
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

describe('GET /api/admin/reports', () => {
  let GET: any

  beforeAll(async () => {
    const route = await import('@/app/api/admin/reports/route')
    GET = route.GET
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertAdminOrThrow.mockResolvedValue({
      user: { id: 'admin-user-id', email: 'admin@example.com' },
    })
    
    // Reset chain mocks
    mockReportChain.select.mockReturnValue(mockReportChain)
    mockReportChain.eq.mockReturnValue(mockReportChain)
    mockReportChain.order.mockReturnValue(mockReportChain)
    mockReportChain.range.mockReturnValue(mockReportChain)
  })

  it('returns 403 when admin check fails', async () => {
    mockAssertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))

    const request = new NextRequest('http://localhost/api/admin/reports')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden: Admin access required')
  })

  it('allows admin to list reports', async () => {
    const mockReports = [
      {
        id: 'report-1',
        sale_id: 'sale-1',
        reporter_profile_id: 'user-1',
        reason: 'spam',
        details: 'Test report',
        status: 'open',
        action_taken: null,
        admin_notes: null,
        created_at: '2025-01-15T12:00:00.000Z', // Deterministic timestamp
        updated_at: '2025-01-15T12:00:00.000Z', // Deterministic timestamp
        sales: {
          id: 'sale-1',
          title: 'Test Sale',
          address: '123 Main St',
          city: 'Test City',
          state: 'KY',
          owner_id: 'owner-1',
        },
      },
    ]

    mockReportChain.range.mockResolvedValue({
      data: mockReports,
      error: null,
      count: 1,
    })

    const request = new NextRequest('http://localhost/api/admin/reports')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBe(1)
    expect(data.data[0].id).toBe('report-1')
    expect(data.pagination).toBeDefined()
    expect(data.pagination.total).toBe(1)
  })

  it('filters reports by status', async () => {
    mockReportChain.eq.mockImplementation((field: string, value: string) => {
      if (field === 'status' && value === 'resolved') {
        return mockReportChain
      }
      return mockReportChain
    })
    
    mockReportChain.range.mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    })

    const request = new NextRequest('http://localhost/api/admin/reports?status=resolved')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(mockReportChain.eq).toHaveBeenCalledWith('status', 'resolved')
  })
})

describe('PATCH /api/admin/reports/[id]', () => {
  let PATCH: any
  const reportId = 'report-1'
  const saleId = 'sale-1'
  const ownerId = 'owner-1'

  beforeAll(async () => {
    const route = await import('@/app/api/admin/reports/[id]/route')
    PATCH = route.PATCH
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertAdminOrThrow.mockResolvedValue({
      user: { id: 'admin-user-id', email: 'admin@example.com' },
    })
    
    // Reset chain mocks
    mockReportChain.select.mockReturnValue(mockReportChain)
    mockReportChain.update.mockReturnValue(mockReportChain)
    mockReportChain.eq.mockReturnValue(mockReportChain)
    mockSaleChain.select.mockReturnValue(mockSaleChain)
    mockSaleChain.update.mockReturnValue(mockSaleChain)
    mockSaleChain.eq.mockReturnValue(mockSaleChain)
    mockProfileChain.update.mockReturnValue(mockProfileChain)
    mockProfileChain.eq.mockReturnValue(mockProfileChain)
  })

  it('returns 403 when admin check fails', async () => {
    mockAssertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))

    const request = new NextRequest(`http://localhost/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    })

    const response = await PATCH(request, { params: { id: reportId } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden: Admin access required')
  })

  it('updates report status', async () => {
    // Mock report lookup
    mockReportChain.maybeSingle.mockResolvedValue({
      data: { id: reportId, sale_id: saleId, status: 'open' },
      error: null,
    })
    
    // Mock report update
    mockReportChain.eq.mockImplementation((field: string, value: string) => {
      if (field === 'id' && value === reportId) {
        return Promise.resolve({ data: null, error: null })
      }
      return mockReportChain
    })

    const request = new NextRequest(`http://localhost/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', admin_notes: 'Resolved by admin' }),
    })

    const response = await PATCH(request, { params: { id: reportId } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockReportChain.update).toHaveBeenCalled()
  })

  it('hides sale when hide_sale is true', async () => {
    // Mock report lookup
    mockReportChain.maybeSingle.mockResolvedValue({
      data: { id: reportId, sale_id: saleId, status: 'open' },
      error: null,
    })
    
    // Mock report update
    mockReportChain.eq.mockImplementation((field: string, value: string) => {
      if (field === 'id' && value === reportId) {
        return Promise.resolve({ data: null, error: null })
      }
      return mockReportChain
    })
    
    // Mock sale update
    let saleUpdateCalled = false
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
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
      if (table === 'sale_reports') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: reportId, sale_id: saleId, status: 'open' },
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

    const request = new NextRequest(`http://localhost/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', hide_sale: true }),
    })

    const response = await PATCH(request, { params: { id: reportId } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(saleUpdateCalled).toBe(true)
    
    // Verify sale was updated with hidden_by_admin
    const saleUpdateCall = mockAdminDb.from('sales').update
    expect(saleUpdateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        moderation_status: 'hidden_by_admin',
      })
    )
  })

  it('locks account when lock_account is true', async () => {
    // Mock report lookup
    mockReportChain.maybeSingle.mockResolvedValue({
      data: { id: reportId, sale_id: saleId, status: 'open' },
      error: null,
    })
    
    // Mock sale lookup for owner_id
    mockSaleChain.maybeSingle.mockResolvedValue({
      data: { owner_id: ownerId },
      error: null,
    })
    
    // Mock report update
    mockReportChain.eq.mockImplementation((field: string, value: string) => {
      if (field === 'id' && value === reportId) {
        return Promise.resolve({ data: null, error: null })
      }
      return mockReportChain
    })
    
    // Mock profile update
    let profileUpdateCalled = false
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'sale_reports') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: reportId, sale_id: saleId, status: 'open' },
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
      if (table === 'sales') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { owner_id: ownerId },
                error: null,
              }),
            })),
          })),
        }
      }
      if (table === 'profiles') {
        return {
          update: vi.fn(() => {
            profileUpdateCalled = true
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

    const request = new NextRequest(`http://localhost/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', lock_account: true }),
    })

    const response = await PATCH(request, { params: { id: reportId } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(profileUpdateCalled).toBe(true)
    
    // Verify profile was updated with lock fields
    const profileUpdateCall = mockAdminDb.from('profiles').update
    expect(profileUpdateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        is_locked: true,
        locked_at: expect.any(String),
        locked_by: expect.any(String),
        lock_reason: expect.stringContaining(reportId),
      })
    )
  })

  it('returns 404 for non-existent report', async () => {
    mockReportChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })

    const request = new NextRequest(`http://localhost/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    })

    const response = await PATCH(request, { params: { id: reportId } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Report not found')
  })

  it('returns 400 for invalid request body', async () => {
    const request = new NextRequest(`http://localhost/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid_status' }),
    })

    const response = await PATCH(request, { params: { id: reportId } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request body')
  })
})

