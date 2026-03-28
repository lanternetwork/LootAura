import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as signupPOST } from '@/app/api/auth/signup/route'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/auth/server-session', () => ({
  setSessionCookies: vi.fn(),
  isValidSession: vi.fn(),
}))

describe('Email Redirect Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('should set emailRedirectTo when NEXT_PUBLIC_SITE_URL is configured', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    process.env.NEXT_PUBLIC_DEBUG = 'true'

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const mockSupabase = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            session: null, // Email confirmation required
          },
          error: null,
        }),
      },
    }

    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'Password123',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await signupPOST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.data?.requiresConfirmation).toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[AUTH] Sign-up redirect configured:',
      { event: 'signup', redirectToSet: true }
    )

    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'Password123',
      options: { emailRedirectTo: 'https://example.com/auth/callback' },
    })

    consoleSpy.mockRestore()
  })

  it('should log warning when NEXT_PUBLIC_SITE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_DEBUG = 'true'

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const mockSupabase = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'test-user-id', email: 'test@example.com' },
            session: null,
          },
          error: null,
        }),
      },
    }

    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'Password123',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    await signupPOST(request)

    expect(consoleSpy).toHaveBeenCalledWith(
      '[AUTH] WARNING: NEXT_PUBLIC_SITE_URL not set, using Supabase default email redirect'
    )

    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'Password123',
    })

    consoleSpy.mockRestore()
  })
})
