/**
 * Integration tests for admin users endpoint
 * Tests GET /api/admin/users with locked filter
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock admin gate
const mockAssertAdminOrThrow = vi.fn()

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: any[]) => mockAssertAdminOrThrow(...args),
}))

// Mock admin DB and query chains
const mockProfileChain = {
  select: vi.fn(() => mockProfileChain),
  eq: vi.fn(() => mockProfileChain),
  or: vi.fn(() => mockProfileChain),
  order: vi.fn(() => mockProfileChain),
  range: vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 })),
}

const mockAdminDb = {
  from: vi.fn((table: string) => {
    if (table === 'profiles') return mockProfileChain
    return mockProfileChain
  }) as any,
}

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => db.from(table),
}))

// Mock rate limiting
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn().mockResolvedValue({ 
    allowed: true, 
    remaining: 10,
    softLimited: false,
    resetAt: 1736942400000 + 60000,
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
    debug: vi.fn(),
  },
  generateOperationId: vi.fn(() => 'test-op-id-123'),
}))

describe('GET /api/admin/users', () => {
  let GET: any

  beforeAll(async () => {
    const route = await import('@/app/api/admin/users/route')
    GET = route.GET
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertAdminOrThrow.mockResolvedValue({
      user: { id: 'admin-user-id', email: 'admin@example.com' },
    })
    
    // Reset chain mocks
    mockProfileChain.select.mockReturnValue(mockProfileChain)
    mockProfileChain.eq.mockReturnValue(mockProfileChain)
    mockProfileChain.or.mockReturnValue(mockProfileChain)
    mockProfileChain.order.mockReturnValue(mockProfileChain)
    mockProfileChain.range.mockResolvedValue({ data: [], error: null, count: 0 })
  })

  it('returns 403 when admin check fails', async () => {
    mockAssertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))

    const request = new NextRequest('http://localhost/api/admin/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden: Admin access required')
  })

  it('allows admin to list users', async () => {
    const mockUsers = [
      {
        id: 'user-1',
        username: 'testuser',
        full_name: 'Test User',
        created_at: '2025-01-15T12:00:00.000Z',
        is_locked: false,
        locked_at: null,
        locked_by: null,
        lock_reason: null,
      },
    ]

    mockProfileChain.range.mockResolvedValue({
      data: mockUsers as any,
      error: null,
      count: 1,
    })

    const request = new NextRequest('http://localhost/api/admin/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBe(1)
    expect(data.data[0].id).toBe('user-1')
    expect(data.pagination).toBeDefined()
  })

  it('filters users by locked status when locked=true', async () => {
    mockProfileChain.eq.mockReturnValue(mockProfileChain)
    
    mockProfileChain.range.mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    })

    const request = new NextRequest('http://localhost/api/admin/users?locked=true')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(mockProfileChain.eq).toHaveBeenCalledWith('is_locked', true)
  })

  it('filters users by unlocked status when locked=false', async () => {
    mockProfileChain.eq.mockReturnValue(mockProfileChain)
    
    mockProfileChain.range.mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    })

    const request = new NextRequest('http://localhost/api/admin/users?locked=false')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(mockProfileChain.eq).toHaveBeenCalledWith('is_locked', false)
  })

  it('does not filter by lock status when locked param is not provided', async () => {
    mockProfileChain.range.mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    })

    const request = new NextRequest('http://localhost/api/admin/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    // Should not call eq with is_locked
    expect(mockProfileChain.eq).not.toHaveBeenCalledWith('is_locked', expect.anything())
  })
})

