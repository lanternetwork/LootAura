/**
 * Integration tests for analytics seed API
 * Tests /api/admin/analytics/seed (POST)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/analytics/seed/route'

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
  getAdminDb: () => ({
    from: vi.fn(),
  }),
  fromBase: (db: any, table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
  }),
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(async () => ({
    user: { id: 'admin-user-id', email: 'admin@example.com' },
  })),
}))

describe('Admin Analytics Seed API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_EMAILS = 'admin@example.com'
    process.env.NEXT_PUBLIC_DEBUG = 'true'
  })

  it('should seed test events and return inserted count', async () => {
    const mockSales = [
      { id: 'sale-1', owner_id: 'admin-user-id' },
      { id: 'sale-2', owner_id: 'admin-user-id' },
    ]

    const mockInserted = Array.from({ length: 10 }, (_, i) => ({ id: `event-${i}` }))

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockSales, error: null }),
    })

    const { fromBase } = await import('@/lib/supabase/clients')
    const mockQuery = fromBase({}, 'sales')
    mockQuery.select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockSales, error: null }),
    })

    const mockInsertQuery = fromBase({}, 'analytics_events')
    mockInsertQuery.insert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: mockInserted, error: null }),
    })

    const request = new NextRequest('http://localhost:3000/api/admin/analytics/seed', {
      method: 'POST',
      body: JSON.stringify({
        days: 7,
        perDay: 10,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('ok')
    expect(data).toHaveProperty('inserted')
    expect(data.ok).toBe(true)
    expect(typeof data.inserted).toBe('number')
    expect(data.inserted).toBeGreaterThanOrEqual(0)
  })

  it('should handle missing sales gracefully', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const request = new NextRequest('http://localhost:3000/api/admin/analytics/seed', {
      method: 'POST',
      body: JSON.stringify({
        days: 7,
        perDay: 10,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data).toHaveProperty('error')
  })
})

