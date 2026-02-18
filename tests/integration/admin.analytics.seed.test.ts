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

const mockRlsDb = {
  from: vi.fn(),
  schema: vi.fn().mockReturnThis(),
}

const mockAdminDb = {
  from: vi.fn(),
  schema: vi.fn().mockReturnThis(),
}

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: async (_request?: any) => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: vi.fn((db: any, table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
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

    const { fromBase } = await import('@/lib/supabase/clients')
    
    // Mock sales query
    const mockSalesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockSales, error: null }),
      single: vi.fn().mockResolvedValue({ data: mockSales[0], error: null }),
    }
    
    // Mock insert query
    const mockInsertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: mockInserted, error: null }),
    }

    // Setup fromBase to return different queries based on table
    vi.mocked(fromBase).mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        return mockSalesQuery as any
      } else if (table === 'analytics_events') {
        return mockInsertQuery as any
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any
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
    const { fromBase } = await import('@/lib/supabase/clients')
    
    // Mock sales query to return empty array
    const mockSalesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    }

    // Setup fromBase to return empty sales
    vi.mocked(fromBase).mockImplementation((_db: any, table: string) => {
      if (table === 'sales') {
        return mockSalesQuery as any
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any
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

