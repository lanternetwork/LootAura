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

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => ({
    from: vi.fn(),
  }),
  fromBase: (db: any, table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
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

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
    })

    const { fromBase } = await import('@/lib/supabase/clients')
    const mockQuery = fromBase({}, 'analytics_events')
    mockQuery.select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
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
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockRejectedValue({ code: '42P01' }), // relation does not exist
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
    const request = new NextRequest('http://localhost:3000/api/admin/analytics/summary?days=14', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.range.days).toBe(14)
  })
})

