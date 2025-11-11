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
  const mockUpdate = vi.fn(() => query)
  return { mockSingle, mockUpdate, query }
}

// Use a mutable object to store the current mock chain
const mockState = { currentMockChain: null as ReturnType<typeof createMockChain> | null }

vi.mock('@/lib/supabase/clients', () => {
  const fromBaseMock = vi.fn((db: any, table: string) => {
    // Use the mock chain set up by the test
    // If not set, throw an error to catch test setup issues
    if (!mockState.currentMockChain) {
      throw new Error('fromBase called but mockState.currentMockChain is not set. Ensure the test sets up the mock chain before calling the route handler.')
    }
    // Return an object with update method which will chain to eq -> select -> single
    return {
      update: mockState.currentMockChain.mockUpdate,
    }
  })
  
  return {
    getRlsDb: vi.fn(() => ({
      schema: vi.fn(() => ({
        from: vi.fn(),
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
    }) as any)
    
    // Create fresh mock chain after mocks are set up
    // This ensures fromBase will create a new chain when called
    mockState.currentMockChain = null
  })

  it('should require authentication', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const mockClient = createSupabaseServerClient() as any
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

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
    
    const mockClient = createSupabaseServerClient() as any
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

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

    const request = new NextRequest('http://localhost/api/profile/social-links', {
      method: 'POST',
      body: JSON.stringify({ links: { twitter: 'johndoe' } }),
    })

    const response = await POST(request)
    const data = await response.json()

    // Debug: if it failed, the error details will be in the test output
    expect(data.ok).toBe(true)
    expect(data.code).toBeUndefined() // Should not have an error code
    expect(data.data.social_links.twitter).toBe('https://twitter.com/johndoe')
  })

  it('should drop invalid links', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    
    const mockClient = createSupabaseServerClient() as any
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

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

    // Debug: if it failed, the error details will be in the test output
    expect(data.ok).toBe(true)
    expect(data.code).toBeUndefined() // Should not have an error code
    expect(data.data.social_links.twitter).toBe('https://twitter.com/johndoe')
    expect(data.data.social_links.invalid).toBeUndefined()
  })
})

