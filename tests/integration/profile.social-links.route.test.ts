import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/profile/social-links/route'
import { NextRequest } from 'next/server'
import * as socialUtils from '@/lib/profile/social'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}))

// Create fresh mocks for each test to avoid state issues
const createMockChain = () => {
  const mockSingle = vi.fn().mockResolvedValue({
    data: null,
    error: null,
  })
  const mockSelect = vi.fn(() => ({
    single: mockSingle,
  }))
  const mockEq = vi.fn(() => ({
    select: mockSelect,
  }))
  const mockUpdate = vi.fn(() => ({
    eq: mockEq,
  }))
  return { mockSingle, mockUpdate }
}

// Use a mutable object to store the current mock chain
const mockState = { currentMockChain: null as ReturnType<typeof createMockChain> | null }

vi.mock('@/lib/supabase/clients', () => {
  const fromBaseMock = vi.fn((db: any, table: string) => {
    if (!mockState.currentMockChain) {
      mockState.currentMockChain = createMockChain()
    }
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
  beforeEach(() => {
    vi.clearAllMocks()
    // Create fresh mock chain for each test
    mockState.currentMockChain = createMockChain()
  })

  it('should require authentication', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const mockClient = createSupabaseServerClient() as any
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    // Ensure mockSingle returns a valid structure (though it shouldn't be called)
    if (mockState.currentMockChain) {
      mockState.currentMockChain.mockSingle.mockResolvedValue({
        data: null,
        error: null,
      })
    }

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

    if (mockState.currentMockChain) {
      mockState.currentMockChain.mockSingle.mockResolvedValue({
      data: {
        social_links: {
          twitter: 'https://twitter.com/johndoe',
        },
      },
      error: null,
      })
    }

    const request = new NextRequest('http://localhost/api/profile/social-links', {
      method: 'POST',
      body: JSON.stringify({ links: { twitter: 'johndoe' } }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.ok).toBe(true)
    expect(data.data.social_links.twitter).toBe('https://twitter.com/johndoe')
  })

  it('should drop invalid links', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    
    const mockClient = createSupabaseServerClient() as any
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    if (mockState.currentMockChain) {
      mockState.currentMockChain.mockSingle.mockResolvedValue({
      data: {
        social_links: {
          twitter: 'https://twitter.com/johndoe',
        },
      },
      error: null,
      })
    }

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
    expect(data.data.social_links.twitter).toBe('https://twitter.com/johndoe')
    expect(data.data.social_links.invalid).toBeUndefined()
  })
})

