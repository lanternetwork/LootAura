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
import { makeThenableQuery, createCallTracker, type QueryResult } from '@/tests/helpers/mockSupabaseQuery'

// Mock Supabase clients
const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
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
  getRlsDb: async (_request?: any) => mockRlsDb,
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
  validateBboxSize: vi.fn(() => null), // Return null (no error) for valid bbox
  getBboxSummary: vi.fn(() => ({})),
}))

/**
 * Helper to assert response status and log detailed error if it fails
 */
async function assertResponseStatus(
  response: Response,
  expectedStatus: number,
  context?: string
): Promise<void> {
  if (response.status !== expectedStatus) {
    // Try to get error details
    let errorBody: any = null
    let errorText = ''
    
    try {
      const cloned = response.clone()
      errorBody = await cloned.json().catch(() => null)
    } catch {
      // Ignore JSON parse errors
    }
    
    try {
      const cloned = response.clone()
      errorText = await cloned.text().catch(() => '')
    } catch {
      // Ignore text parse errors
    }
    
    // Truncate to ~2k chars
    const errorBodyStr = errorBody ? JSON.stringify(errorBody, null, 2).substring(0, 2000) : 'null'
    const errorTextStr = errorText.substring(0, 2000)
    
    console.error(`[TEST ERROR] Expected status ${expectedStatus}, got ${response.status}${context ? ` (${context})` : ''}`)
    console.error(`[TEST ERROR] Response body (JSON):`, errorBodyStr)
    console.error(`[TEST ERROR] Response body (text):`, errorTextStr)
    
    expect(response.status).toBe(expectedStatus)
  }
}

describe('GET /api/sales - Search Query Injection Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default query result
    const defaultResult: QueryResult = { data: [], error: null, count: 0 }
    
    // Setup default mocks for sales_v2 queries
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        // For count queries: .select('*', { count: 'exact', head: true })
        // This returns { count, error } (not { data, error, count })
        // Create a thenable that supports chaining and returns { count, error }
        const createCountQuery = () => {
          const countPromise = Promise.resolve({ count: 0, error: null })
          return new Proxy({}, {
            get(_target, prop) {
              const propName = String(prop)
              if (propName === 'then') {
                return countPromise.then.bind(countPromise)
              }
              if (propName === 'catch') {
                return countPromise.catch.bind(countPromise)
              }
              if (propName === 'finally') {
                return countPromise.finally.bind(countPromise)
              }
              // For any other method (eq, in, etc.), return the same proxy for chaining
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return function(...args: any[]) {
                return createCountQuery()
              }
            }
          })
        }
        
        // For main queries: regular select chain
        const mainQuery = makeThenableQuery(defaultResult)
        
        // Return an object that has both behaviors
        // When .select() is called with count options, return count query
        // Otherwise return main query
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return function(columns?: string, options?: any) {
                // If options has count, return count query
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                // Otherwise return main query (which is chainable)
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      // Default for other tables
      return makeThenableQuery(defaultResult)
    })
    
    // Mock items_v2 query (for category filtering)
    mockFromBase.mockImplementation((db: any, table: string) => {
      if (table === 'items_v2') {
        return makeThenableQuery({ 
          data: [], 
          error: null 
        })
      }
      return makeThenableQuery({ data: [], error: null })
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
    
    const tracker = createCallTracker()
    const orTracker = createCallTracker()
    
    // Create query that tracks .or() calls
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null }, orTracker)
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'benign search query')
    const data = await response.json()

    expect(data.ok).toBe(true)
    
    // Check that .or() was called with sanitized filter
    // Find the .or() call that contains title.ilike (search query filter, not date filter)
    const orCalls = orTracker.getCalls('or')
    const searchQueryCall = orCalls.find(call => {
      const filterStr = String(call[0])
      return filterStr.includes('title.ilike')
    })
    expect(searchQueryCall).toBeDefined()
    if (searchQueryCall) {
      const filterStr = String(searchQueryCall[0])
      // Filter contains: title.ilike.%garage sale%,description.ilike.%garage sale%,address.ilike.%garage sale%
      // The commas are part of PostgREST .or() syntax (separating conditions), not from user input
      expect(filterStr).toContain('garage sale')
      expect(filterStr).toContain('title.ilike')
      expect(filterStr).toContain('description.ilike')
      expect(filterStr).toContain('address.ilike')
      // For benign input 'garage sale', no dangerous chars to verify removal
      // But verify the filter structure is correct (has 3 parts separated by commas)
    }
  })

  it('should sanitize commas that break .or() syntax', async () => {
    const request = createRequest('test,value')
    
    const orTracker = createCallTracker()
    
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null }, orTracker)
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'sanitize commas')
    const data = await response.json()

    expect(data.ok).toBe(true)
    
    // Verify comma is removed from filter
    // Find the .or() call that contains title.ilike (search query filter, not date filter)
    const orCalls = orTracker.getCalls('or')
    const searchQueryCall = orCalls.find(call => {
      const filterStr = String(call[0])
      return filterStr.includes('title.ilike')
    })
    expect(searchQueryCall).toBeDefined()
    if (searchQueryCall) {
      const filterStr = String(searchQueryCall[0])
      // Filter contains commas as part of PostgREST syntax, but user input was sanitized
      expect(filterStr).toContain('test')
      expect(filterStr).toContain('value')
      // Verify the sanitized query (user input) doesn't contain commas
      // The original input 'test,value' should have been sanitized to 'testvalue'
      expect(filterStr).toContain('testvalue') // Comma removed from user input
      expect(filterStr).not.toContain('test,value') // Original with comma should not appear
    }
  })

  it('should sanitize parentheses that break filter syntax', async () => {
    const request = createRequest('test(value)')
    
    const orTracker = createCallTracker()
    
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null }, orTracker)
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'sanitize parentheses')
    const data = await response.json()

    expect(data.ok).toBe(true)
    
    // Verify parentheses are removed
    // Find the .or() call that contains title.ilike (search query filter, not date filter)
    const orCalls = orTracker.getCalls('or')
    const searchQueryCall = orCalls.find(call => {
      const filterStr = String(call[0])
      return filterStr.includes('title.ilike')
    })
    expect(searchQueryCall).toBeDefined()
    if (searchQueryCall) {
      const filterStr = String(searchQueryCall[0])
      // Filter contains commas as part of PostgREST syntax, but user input was sanitized
      expect(filterStr).toContain('test')
      expect(filterStr).toContain('value')
      // Verify parentheses were removed from user input
      // Original input 'test(value)' should have been sanitized to 'testvalue'
      expect(filterStr).toContain('testvalue') // Parentheses removed from user input
      expect(filterStr).not.toContain('test(value)') // Original with parentheses should not appear
    }
  })

  it('should escape PostgreSQL wildcards (% and _)', async () => {
    const request = createRequest('test%value_here')
    
    const orTracker = createCallTracker()
    
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null }, orTracker)
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'escape wildcards')
    const data = await response.json()

    expect(data.ok).toBe(true)
    
    // Verify wildcards are escaped (doubled)
    // Find the .or() call that contains title.ilike (search query filter, not date filter)
    const orCalls = orTracker.getCalls('or')
    const searchQueryCall = orCalls.find(call => {
      const filterStr = String(call[0])
      return filterStr.includes('title.ilike')
    })
    expect(searchQueryCall).toBeDefined()
    if (searchQueryCall) {
      const filterStr = String(searchQueryCall[0])
      // Verify wildcards are escaped (doubled) in the sanitized user input
      // Original input 'test%value_here' should have wildcards escaped to 'test%%value__here'
      expect(filterStr).toContain('%%')
      expect(filterStr).toContain('__')
    }
  })

  it('should handle malicious injection attempt: a,b) or (', async () => {
    const request = createRequest('a,b) or (')
    
    const orTracker = createCallTracker()
    
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null }, orTracker)
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'malicious injection')
    const data = await response.json()

    expect(data.ok).toBe(true)
    
    // Verify dangerous characters are removed
    // Find the .or() call that contains title.ilike (search query filter, not date filter)
    const orCalls = orTracker.getCalls('or')
    const searchQueryCall = orCalls.find(call => {
      const filterStr = String(call[0])
      return filterStr.includes('title.ilike')
    })
    expect(searchQueryCall).toBeDefined()
    if (searchQueryCall) {
      const filterStr = String(searchQueryCall[0])
      // Query should still be valid
      expect(filterStr).toContain('title.ilike')
      expect(filterStr).toContain('description.ilike')
      expect(filterStr).toContain('address.ilike')
      // Verify dangerous chars were removed from user input
      // Original input 'a,b) or (' should have been sanitized to 'ab or'
      // The filter will contain 'ab or' (sanitized), not the original dangerous chars
      expect(filterStr).toContain('ab or') // Sanitized version
      expect(filterStr).not.toContain('a,b) or (') // Original with dangerous chars should not appear
    }
  })

  it('should enforce max length on search query', async () => {
    const longQuery = 'a'.repeat(250)
    const request = createRequest(longQuery)
    
    const response = await GET(request)
    await assertResponseStatus(response, 400, 'max length')
    const data = await response.json()

    // Should return 400 for query too long
    expect(data.ok).toBe(false)
    expect(data.code).toBe('QUERY_TOO_LONG')
  })

  it('should handle empty search query', async () => {
    const request = createRequest('')
    
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null })
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'empty query')
    const data = await response.json()

    // Empty query should not trigger .or() call
    expect(data.ok).toBe(true)
  })

  it('should handle null search query', async () => {
    const request = createRequest(null)
    
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null })
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'null query')
    const data = await response.json()

    // Null query should not trigger .or() call
    expect(data.ok).toBe(true)
  })

  it('should not widen search scope with malicious input', async () => {
    // This test verifies that malicious input doesn't cause the query
    // to return more results than it should
    const request = createRequest('test%')
    
    const orTracker = createCallTracker()
    
    const createCountQuery = () => {
      const countPromise = Promise.resolve({ count: 0, error: null })
      return new Proxy({}, {
        get(_target, prop) {
          const propName = String(prop)
          if (propName === 'then') {
            return countPromise.then.bind(countPromise)
          }
          if (propName === 'catch') {
            return countPromise.catch.bind(countPromise)
          }
          if (propName === 'finally') {
            return countPromise.finally.bind(countPromise)
          }
          return function(...args: any[]) {
            return createCountQuery()
          }
        }
      })
    }
    
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        const mainQuery = makeThenableQuery({ data: [], error: null }, orTracker)
        
        return new Proxy(mainQuery, {
          get(target, prop) {
            if (prop === 'select') {
              return function(columns?: string, options?: any) {
                if (options?.count || options?.head) {
                  return createCountQuery()
                }
                return target
              }
            }
            return (target as any)[prop]
          }
        })
      }
      return makeThenableQuery({ data: [], error: null })
    })
    
    mockFromBase.mockImplementation(() => makeThenableQuery({ data: [], error: null }))

    const response = await GET(request)
    await assertResponseStatus(response, 200, 'malicious input scope')
    const data = await response.json()

    expect(data.ok).toBe(true)
    
    // Find the .or() call that contains title.ilike (search query filter, not date filter)
    const orCalls = orTracker.getCalls('or')
    const searchQueryCall = orCalls.find(call => {
      const filterStr = String(call[0])
      return filterStr.includes('title.ilike')
    })
    expect(searchQueryCall).toBeDefined()
    
    if (searchQueryCall) {
      const filterStr = String(searchQueryCall[0])
      // Verify the filter structure is intact
      expect(filterStr).toContain('title.ilike')
      expect(filterStr).toContain('description.ilike')
      expect(filterStr).toContain('address.ilike')
      // Verify wildcard is escaped
      expect(filterStr).toContain('%%')
      // Verify filter has exactly 3 parts (title, description, address)
      // Split by comma to count parts (commas separate filter expressions in .or())
      const parts = filterStr.split(',')
      expect(parts.length).toBe(3)
    }
  })
})
