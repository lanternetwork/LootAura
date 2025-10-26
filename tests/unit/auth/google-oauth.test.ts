import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as googlePOST } from '@/app/api/auth/google/route'

// Mock the server session module
vi.mock('@/lib/auth/server-session', () => ({
  createServerSupabaseClient: vi.fn(),
}))

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
  })),
}))

describe('Google OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should initiate Google OAuth successfully', async () => {
    const mockSupabase = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: {
            url: 'https://accounts.google.com/oauth/authorize?client_id=...',
          },
          error: null,
        }),
      },
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/auth/google', {
      method: 'POST',
    })

    const response = await googlePOST(request)
    const data = await response.json()

    expect(response.status).toBe(200) // Success with JSON response
    expect(data.url).toBe('https://accounts.google.com/oauth/authorize?client_id=...')
    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback',
      },
    })
  })

  it('should handle OAuth failure', async () => {
    const mockSupabase = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'OAuth provider not configured' },
        }),
      },
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/auth/google', {
      method: 'POST',
    })

    const response = await googlePOST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.code).toBe('OAuth provider not configured')
    expect(data.message).toBe('Auth failed')
  })

  it('should use request origin for redirect URL', async () => {
    const mockSupabase = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: {
            url: 'https://accounts.google.com/oauth/authorize?client_id=...',
          },
          error: null,
        }),
      },
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('https://example.com/api/auth/google', {
      method: 'POST',
    })

    await googlePOST(request)

    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://example.com/auth/callback',
      },
    })
  })
})
