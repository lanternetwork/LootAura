import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/profile/social-links/route'
import { NextRequest } from 'next/server'

// Mock dependencies
// Use a factory function to ensure fresh mocks after clearAllMocks
vi.mock('@/lib/supabase/server', () => {
  return {
    createSupabaseServerClient: vi.fn(() => {
      // Always return a fresh mock client with a properly configured getUser
      return {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
        rpc: vi.fn(), // Mock rpc method
      }
    }),
  }
})

// Create fresh mocks for each test to avoid state issues
const createMockChain = () => {
  // Don't set a default - each test must set it explicitly
  const mockSingle = vi.fn()
  // Create a query object that supports chaining, similar to other tests
  const query = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: mockSingle, // This will be called as .single(), so mockSingle must be a function
  }
  // mockUpdate must be a function that returns the query object
  const mockUpdate = () => query
  return { mockSingle, mockUpdate, query }
}

// Use a mutable object to store the current mock chain
const mockState = { currentMockChain: null as ReturnType<typeof createMockChain> | null }

vi.mock('@/lib/supabase/clients', () => {
  const fromBaseMock = vi.fn((db: any, table: string) => {
    // Use the mock chain set up by the test
    // If not set, return a default chainable mock
    if (!mockState.currentMockChain) {
      // Return a default chainable mock for account lock checks
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_locked: false },
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
    // Return an object with update and select methods
    return {
      update: mockState.currentMockChain.mockUpdate,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_locked: false },
            error: null,
          }),
        })),
      })),
    }
  })
  
  return {
    getRlsDb: vi.fn(async (_request?: any) => {
      // getRlsDb() returns a schema-scoped client that fromBase can use
      // fromBase calls db.from(table), which should return the query chain
      if (!mockState.currentMockChain) {
        // Return a default chainable mock
        return {
          from: vi.fn(() => ({
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { is_locked: false },
                  error: null,
                }),
              })),
            })),
          })),
        }
      }
      const chain = mockState.currentMockChain
      return {
        from: vi.fn(() => ({
          update: chain.mockUpdate,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { is_locked: false },
                error: null,
              }),
            })),
          })),
        })),
      }
    }),
    getAdminDb: vi.fn(() => ({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_locked: false },
              error: null,
            }),
          })),
        })),
      })),
    })),
    fromBase: fromBaseMock,
  }
})

vi.mock('@sentry/nextjs', () => ({
  default: {
    captureException: vi.fn(),
  },
}))

describe('POST /api/profile/social-links', () => {
  beforeEach(async () => {
    // Reset mock chain and create fresh mocks
    mockState.currentMockChain = null
    
    // Re-setup the mock factory implementation first
    const mod = await import('@/lib/supabase/server')
    vi.mocked(mod.createSupabaseServerClient).mockImplementation(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      rpc: vi.fn(), // Mock rpc method
    }) as any)
    
    // Create fresh mock chain after mocks are set up
    // This ensures fromBase will create a new chain when called
    mockState.currentMockChain = null
  })

  it('should require authentication', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    // Set up the mock implementation before the route handler calls it
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Not authenticated' },
        }),
      },
      rpc: vi.fn(), // Mock rpc method
    } as any)

    const request = new NextRequest('http://localhost/api/profile/social-links', {
      method: 'POST',
      body: JSON.stringify({ links: { twitter: 'johndoe' } }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.ok).toBe(false)
    expect(data.code).toBe('AUTH_REQUIRED')
  })

  it('should normalize and update social links', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    
    // Create fresh mock chain with the expected return value
    const chain = createMockChain()
    chain.mockSingle.mockResolvedValue({
      data: {
        social_links: {
          twitter: 'https://twitter.com/johndoe',
        },
      },
      error: null,
    })
    mockState.currentMockChain = chain
    
    // Set up the mock implementation before the route handler calls it
    // The route now uses supabase.rpc('update_profile', ...) instead of direct table updates
    const mockRpc = vi.fn().mockResolvedValue({
      data: JSON.stringify({ social_links: { twitter: 'https://twitter.com/johndoe' } }),
      error: null,
    })
    
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null,
        }),
      },
      rpc: mockRpc,
    } as any)

    const request = new NextRequest('http://localhost/api/profile/social-links', {
      method: 'POST',
      body: JSON.stringify({ links: { twitter: 'johndoe' } }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.ok).toBe(true)
    expect(data.code).toBeUndefined() // Should not have an error code
    expect(data.data.social_links.twitter).toBe('https://twitter.com/johndoe')
    
    // Verify RPC was called with correct parameters
    expect(mockRpc).toHaveBeenCalledWith('update_profile', {
      p_user_id: 'user-123',
      p_social_links: { twitter: 'https://twitter.com/johndoe' },
    })
  })

  it('should drop invalid links', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    
    // Create fresh mock chain with the expected return value
    const chain = createMockChain()
    // Set the return value explicitly - must be set before fromBase is called
    chain.mockSingle.mockResolvedValue({
      data: {
        social_links: {
          twitter: 'https://twitter.com/johndoe',
        },
      },
      error: null,
    })
    mockState.currentMockChain = chain
    
    // Set up the mock implementation before the route handler calls it
    // The route now uses supabase.rpc('update_profile', ...) instead of direct table updates
    const mockRpc = vi.fn().mockResolvedValue({
      data: JSON.stringify({ social_links: { twitter: 'https://twitter.com/johndoe' } }),
      error: null,
    })
    
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null,
        }),
      },
      rpc: mockRpc,
    } as any)

    const request = new NextRequest('http://localhost/api/profile/social-links', {
      method: 'POST',
      body: JSON.stringify({ 
        links: { 
          twitter: 'johndoe',
          invalid: 'bad@#$handle',
        } 
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.ok).toBe(true)
    expect(data.code).toBeUndefined() // Should not have an error code
    expect(data.data.social_links.twitter).toBe('https://twitter.com/johndoe')
    expect(data.data.social_links.invalid).toBeUndefined()
    
    // Verify RPC was called with correct parameters (invalid link should be dropped)
    expect(mockRpc).toHaveBeenCalledWith('update_profile', {
      p_user_id: 'user-123',
      p_social_links: { twitter: 'https://twitter.com/johndoe' },
    })
  })
})

