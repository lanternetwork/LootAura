/**
 * Integration tests for analytics summary API
 * Tests /api/admin/analytics/summary (GET)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/admin/analytics/summary/route'

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabase,
}))

const mockRlsDb = {
  from: vi.fn(),
  schema: vi.fn().mockReturnThis(),
}

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: async (_request?: any) => mockRlsDb,
  fromBase: vi.fn((db: any, table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
    }
    return query
  }),
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(async () => ({
    user: { id: 'admin-user-id', email: 'admin@example.com' },
  })),
}))

describe('Admin Analytics Summary API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_EMAILS = 'admin@example.com'
    process.env.NEXT_PUBLIC_DEBUG = 'true'
  })

  it('should return analytics summary with correct shape', async () => {
    const mockEvents = [
      { event_type: 'view', ts: new Date().toISOString() },
      { event_type: 'save', ts: new Date().toISOString() },
      { event_type: 'click', ts: new Date().toISOString() },
    ]

    // Mock view query (for table existence check)
    const mockViewQuery = Promise.resolve({ data: [{ ts: new Date().toISOString() }], error: null })
    Object.assign(mockViewQuery, {
      select: vi.fn().mockReturnValue(mockViewQuery),
      limit: vi.fn().mockReturnValue(mockViewQuery),
      order: vi.fn().mockReturnValue(mockViewQuery),
      eq: vi.fn().mockReturnValue(mockViewQuery),
    })
    mockSupabase.from.mockReturnValue(mockViewQuery as any)

    // Mock fromBase to handle multiple calls (analytics_events and sales)
    const { fromBase } = await import('@/lib/supabase/clients')
    const mockSalesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sale-1', owner_id: 'admin-user-id' }, error: null }),
    }
    // Create a Promise-like query object that supports chaining
    const mockEventsQueryPromise = Promise.resolve({ data: mockEvents, error: null })
    const mockEventsQuery: any = {}
    mockEventsQuery.select = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.eq = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.gte = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.lte = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.order = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.then = mockEventsQueryPromise.then.bind(mockEventsQueryPromise)
    mockEventsQuery.catch = mockEventsQueryPromise.catch.bind(mockEventsQueryPromise)
    mockEventsQuery.finally = mockEventsQueryPromise.finally.bind(mockEventsQueryPromise)
    vi.mocked(fromBase).mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        return mockSalesQuery as any
      }
      return mockEventsQuery as any
    })

    const request = new NextRequest('http://localhost:3000/api/admin/analytics/summary?days=7', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('ok')
    expect(data).toHaveProperty('meta')
    expect(data).toHaveProperty('range')
    expect(data).toHaveProperty('totals')
    expect(data).toHaveProperty('series')

    expect(data.meta).toHaveProperty('tableExists')
    expect(data.meta).toHaveProperty('rlsReadable')
    expect(data.range).toHaveProperty('from')
    expect(data.range).toHaveProperty('to')
    expect(data.range).toHaveProperty('days')
    expect(data.totals).toHaveProperty('view')
    expect(data.totals).toHaveProperty('save')
    expect(data.totals).toHaveProperty('click')
    expect(data.totals).toHaveProperty('share')
    expect(data.totals).toHaveProperty('favorite')
    expect(Array.isArray(data.series)).toBe(true)
  })

  it('should handle missing table gracefully', async () => {
    // Mock view query to return error with code '42P01' (relation does not exist)
    // The query chain is: from().select().limit().order().eq() then await
    // In Supabase, the query builder methods return 'this' for chaining, but the query itself is a Promise
    // When we await the query, it should return the error
    const mockViewQuery = Promise.resolve({ data: null, error: { code: '42P01' } })
    Object.assign(mockViewQuery, {
      select: vi.fn().mockReturnValue(mockViewQuery),
      limit: vi.fn().mockReturnValue(mockViewQuery),
      order: vi.fn().mockReturnValue(mockViewQuery),
      eq: vi.fn().mockReturnValue(mockViewQuery),
    })
    mockSupabase.from.mockReturnValue(mockViewQuery as any)

    // Mock fromBase for analytics_events query (should return empty)
    const { fromBase } = await import('@/lib/supabase/clients')
    const mockSalesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sale-1', owner_id: 'admin-user-id' }, error: null }),
    }
    // Create a Promise-like query object that supports chaining
    const mockEventsQueryPromise = Promise.resolve({ data: [], error: null })
    const mockEventsQuery: any = {}
    mockEventsQuery.select = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.eq = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.gte = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.lte = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.order = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.then = mockEventsQueryPromise.then.bind(mockEventsQueryPromise)
    mockEventsQuery.catch = mockEventsQueryPromise.catch.bind(mockEventsQueryPromise)
    mockEventsQuery.finally = mockEventsQueryPromise.finally.bind(mockEventsQueryPromise)
    vi.mocked(fromBase).mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        return mockSalesQuery as any
      }
      return mockEventsQuery as any
    })

    const request = new NextRequest('http://localhost:3000/api/admin/analytics/summary?days=7', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.meta.tableExists).toBe(false)
    expect(data.meta.rlsReadable).toBe(false)
  })

  it('should respect days parameter', async () => {
    // Mock view query (for table existence check)
    const mockViewQuery = Promise.resolve({ data: [{ ts: new Date().toISOString() }], error: null })
    Object.assign(mockViewQuery, {
      select: vi.fn().mockReturnValue(mockViewQuery),
      limit: vi.fn().mockReturnValue(mockViewQuery),
      order: vi.fn().mockReturnValue(mockViewQuery),
      eq: vi.fn().mockReturnValue(mockViewQuery),
    })
    mockSupabase.from.mockReturnValue(mockViewQuery as any)

    // Mock fromBase for analytics_events query
    const { fromBase } = await import('@/lib/supabase/clients')
    const mockSalesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'sale-1', owner_id: 'admin-user-id' }, error: null }),
    }
    // Create a Promise-like query object that supports chaining
    const mockEventsQueryPromise = Promise.resolve({ data: [], error: null })
    const mockEventsQuery: any = {}
    mockEventsQuery.select = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.eq = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.gte = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.lte = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.order = vi.fn().mockReturnValue(mockEventsQuery)
    mockEventsQuery.then = mockEventsQueryPromise.then.bind(mockEventsQueryPromise)
    mockEventsQuery.catch = mockEventsQueryPromise.catch.bind(mockEventsQueryPromise)
    mockEventsQuery.finally = mockEventsQueryPromise.finally.bind(mockEventsQueryPromise)
    vi.mocked(fromBase).mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        return mockSalesQuery as any
      }
      return mockEventsQuery as any
    })

    const request = new NextRequest('http://localhost:3000/api/admin/analytics/summary?days=14', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.range.days).toBe(14)
  })
})

