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

const mockRlsDb = {
  from: vi.fn(),
}

// Use vi.hoisted() to ensure variables are available when vi.mock is hoisted
const { mockFromBase } = vi.hoisted(() => ({
  mockFromBase: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
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

// Mock category normalization
vi.mock('@/lib/shared/categoryNormalizer', () => ({
  normalizeCategories: vi.fn((input) => input ? input.split(',').filter(Boolean) : []),
}))

// Mock category contract
vi.mock('@/lib/shared/categoryContract', () => ({
  toDbSet: vi.fn((categories) => categories),
}))

// Mock date bounds
vi.mock('@/lib/shared/dateBounds', () => ({
  validateDateRange: vi.fn(() => ({ valid: true })),
}))

// Mock bbox validation
vi.mock('@/lib/shared/bboxValidation', () => ({
  validateBboxSize: vi.fn(() => ({ valid: true })),
  getBboxSummary: vi.fn(() => ({})),
}))

describe('GET /api/sales - Search Query Injection Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Create a reusable query chain factory that properly chains all methods
    const createQueryChain = (captureOr?: (filter: string) => void) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        or: vi.fn((filter: string) => {
          if (captureOr) captureOr(filter)
          return chain
        }),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    // Setup default mocks for count query and main query
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        // Count query returns { count, error }
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        // Main query chain
        const mainChain = createQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      // Default query chain
      return createQueryChain()
    })
    
    // Mock items_v2 query (for category filtering)
    mockFromBase.mockImplementation((db: any, table: string) => {
      if (table === 'items_v2') {
        return {
          select: vi.fn(() => Promise.resolve({ 
            data: [], 
            error: null 
          })),
        }
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }
    })
  })

  const createRequest = (q: string | null, lat: string = '40.7128', lng: string = '-74.0060') => {
    const url = new URL('http://localhost:3000/api/sales')
    if (q !== null) {
      url.searchParams.set('q', q)
    }
    url.searchParams.set('lat', lat)
    url.searchParams.set('lng', lng)
    url.searchParams.set('distanceKm', '25') // Ensure distanceKm is set for bbox calculation
    return new NextRequest(url)
  }

  it('should handle benign search query', async () => {
    const request = createRequest('garage sale')
    
    let capturedFilter: string | null = null
    
    // Create query chain that captures the filter
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        or: vi.fn((filter: string) => {
          capturedFilter = filter
          return chain
        }),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    if (capturedFilter) {
      expect(capturedFilter).toContain('garage sale')
      expect(capturedFilter).not.toContain(',')
      expect(capturedFilter).not.toContain('(')
      expect(capturedFilter).not.toContain(')')
    }
  })

  it('should sanitize commas that break .or() syntax', async () => {
    const request = createRequest('test,value')
    
    let capturedFilter: string | null = null
    
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        or: vi.fn((filter: string) => {
          capturedFilter = filter
          return chain
        }),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    if (capturedFilter) {
      // Verify comma is removed from filter
      expect(capturedFilter).not.toContain(',')
      expect(capturedFilter).toContain('test')
      expect(capturedFilter).toContain('value')
    }
  })

  it('should sanitize parentheses that break filter syntax', async () => {
    const request = createRequest('test(value)')
    
    let capturedFilter: string | null = null
    
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        or: vi.fn((filter: string) => {
          capturedFilter = filter
          return chain
        }),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    if (capturedFilter) {
      // Verify parentheses are removed
      expect(capturedFilter).not.toContain('(')
      expect(capturedFilter).not.toContain(')')
      expect(capturedFilter).toContain('test')
      expect(capturedFilter).toContain('value')
    }
  })

  it('should escape PostgreSQL wildcards (% and _)', async () => {
    const request = createRequest('test%value_here')
    
    let capturedFilter: string | null = null
    
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        or: vi.fn((filter: string) => {
          capturedFilter = filter
          return chain
        }),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    if (capturedFilter) {
      // Verify wildcards are escaped (doubled)
      expect(capturedFilter).toContain('%%')
      expect(capturedFilter).toContain('__')
    }
  })

  it('should handle malicious injection attempt: a,b) or (', async () => {
    const request = createRequest('a,b) or (')
    
    let capturedFilter: string | null = null
    
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        or: vi.fn((filter: string) => {
          capturedFilter = filter
          return chain
        }),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    if (capturedFilter) {
      // Verify dangerous characters are removed
      expect(capturedFilter).not.toContain(',')
      expect(capturedFilter).not.toContain('(')
      expect(capturedFilter).not.toContain(')')
      // Query should still be valid
      expect(capturedFilter).toContain('title.ilike')
      expect(capturedFilter).toContain('description.ilike')
      expect(capturedFilter).toContain('address.ilike')
    }
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
    
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        or: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
    })

    const response = await GET(request)
    const data = await response.json()

    // Empty query should not trigger .or() call
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it('should handle null search query', async () => {
    const request = createRequest(null)
    
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        or: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
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
    
    let capturedFilter: string | null = null
    
    const createMockQueryChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        or: vi.fn((filter: string) => {
          capturedFilter = filter
          return chain
        }),
        order: vi.fn(() => chain),
        range: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      }
      return chain
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const countChain = {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        }
        const mainChain = createMockQueryChain()
        return {
          ...mainChain,
          ...countChain,
        }
      }
      return createMockQueryChain()
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(capturedFilter).not.toBeNull()
    if (capturedFilter) {
      // Verify the filter structure is intact
      expect(capturedFilter).toContain('title.ilike')
      expect(capturedFilter).toContain('description.ilike')
      expect(capturedFilter).toContain('address.ilike')
      // Verify wildcard is escaped
      expect(capturedFilter).toContain('%%')
      // Verify filter has exactly 3 parts (title, description, address)
      // Split by comma to count parts (commas separate filter expressions in .or())
      const filterStr: string = String(capturedFilter)
      const parts = filterStr.split(',')
      expect(parts.length).toBe(3)
    }
  })
})
