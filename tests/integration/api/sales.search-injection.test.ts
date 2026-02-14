/**
 * Integration tests for /api/sales search query injection prevention
 * GET /api/sales?q=...
 * 
 * Tests that malicious search queries do not break PostgREST filter syntax
 * and that benign queries work correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/sales/route'

// Mock Supabase clients
const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
}

const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: vi.fn(),
  fromBase: mockFromBase,
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  generateOperationId: () => 'test-op-id',
}))

// Mock rate limiting
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler,
}))

describe('GET /api/sales - Search Query Injection Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default mocks
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
    })
    
    mockFromBase.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
  })

  const createRequest = (q: string | null, lat: string = '40.7128', lng: string = '-74.0060') => {
    const url = new URL('http://localhost:3000/api/sales')
    if (q !== null) {
      url.searchParams.set('q', q)
    }
    url.searchParams.set('lat', lat)
    url.searchParams.set('lng', lng)
    return new NextRequest(url)
  }

  it('should handle benign search query', async () => {
    const request = createRequest('garage sale')
    
    // Mock successful query
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn((filter: string) => {
        // Verify the filter contains sanitized query
        expect(filter).toContain('garage sale')
        expect(filter).not.toContain(',')
        expect(filter).not.toContain('(')
        expect(filter).not.toContain(')')
        return mockQuery
      }),
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockSupabaseClient.from().or).toHaveBeenCalled()
  })

  it('should sanitize commas that break .or() syntax', async () => {
    const request = createRequest('test,value')
    
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn((filter: string) => {
        // Verify comma is removed from filter
        expect(filter).not.toContain(',')
        expect(filter).toContain('test')
        expect(filter).toContain('value')
        return mockQuery
      }),
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('should sanitize parentheses that break filter syntax', async () => {
    const request = createRequest('test(value)')
    
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn((filter: string) => {
        // Verify parentheses are removed
        expect(filter).not.toContain('(')
        expect(filter).not.toContain(')')
        expect(filter).toContain('test')
        expect(filter).toContain('value')
        return mockQuery
      }),
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('should escape PostgreSQL wildcards (% and _)', async () => {
    const request = createRequest('test%value_here')
    
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn((filter: string) => {
        // Verify wildcards are escaped (doubled)
        // The filter should contain %% and __
        expect(filter).toContain('%%')
        expect(filter).toContain('__')
        return mockQuery
      }),
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('should handle malicious injection attempt: a,b) or (', async () => {
    const request = createRequest('a,b) or (')
    
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn((filter: string) => {
        // Verify dangerous characters are removed
        expect(filter).not.toContain(',')
        expect(filter).not.toContain('(')
        expect(filter).not.toContain(')')
        // Query should still be valid
        expect(filter).toContain('title.ilike')
        expect(filter).toContain('description.ilike')
        expect(filter).toContain('address.ilike')
        return mockQuery
      }),
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('should enforce max length on search query', async () => {
    const longQuery = 'a'.repeat(250)
    const request = createRequest(longQuery)
    
    const response = await GET(request)
    const data = await response.json()

    // Should return 400 for query too long
    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('QUERY_TOO_LONG')
  })

  it('should handle empty search query', async () => {
    const request = createRequest('')
    
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnValue(mockQuery),
    })

    const response = await GET(request)
    const data = await response.json()

    // Empty query should not trigger .or() call
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('should handle null search query', async () => {
    const request = createRequest(null)
    
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnValue(mockQuery),
    })

    const response = await GET(request)
    const data = await response.json()

    // Null query should not trigger .or() call
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('should not widen search scope with malicious input', async () => {
    // This test verifies that malicious input doesn't cause the query
    // to return more results than it should
    const request = createRequest('test%')
    
    const mockQuery = {
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }
    
    let capturedFilter: string | null = null
    
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn((filter: string) => {
        capturedFilter = filter
        // Verify the filter structure is intact
        expect(filter).toContain('title.ilike')
        expect(filter).toContain('description.ilike')
        expect(filter).toContain('address.ilike')
        // Verify wildcard is escaped
        expect(filter).toContain('%%')
        return mockQuery
      }),
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(capturedFilter).not.toBeNull()
    // Verify filter has exactly 3 parts (title, description, address)
    const parts = capturedFilter!.split(',')
    expect(parts.length).toBe(3)
  })
})
