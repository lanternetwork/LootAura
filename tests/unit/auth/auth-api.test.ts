import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as signinPOST } from '@/app/api/auth/signin/route'
import { POST as signupPOST } from '@/app/api/auth/signup/route'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'

// Mock the server session module
vi.mock('@/lib/auth/server-session', () => ({
  createServerSupabaseClient: vi.fn(),
  setSessionCookies: vi.fn(),
  clearSessionCookies: vi.fn(),
  isValidSession: vi.fn(),
}))

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
  })),
}))

describe('Auth API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  describe('POST /api/auth/signin', () => {
    it('should reject invalid email format', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'password123',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await signinPOST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input data')
      expect(data.details).toBeDefined()
    })

    it('should reject weak password', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: '123', // Too short
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await signinPOST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input data')
    })

    it('should handle successful signin', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user: { id: 'test-user-id', email: 'test@example.com' },
              },
              user: { id: 'test-user-id', email: 'test@example.com' },
            },
            error: null,
          }),
        },
      }

      const { createServerSupabaseClient, isValidSession } = await import('@/lib/auth/server-session')
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)
      vi.mocked(isValidSession).mockReturnValue(true)

      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await signinPOST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user).toBeDefined()
      expect(data.message).toBe('Sign in successful')
    })
  })

  describe('POST /api/auth/signup', () => {
    it('should reject weak password', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'weak', // Too weak
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await signupPOST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input data')
    })

    it('should reject password without required complexity', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password', // No uppercase, no number
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await signupPOST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input data')
    })

    it('should handle successful signup', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                user: { id: 'test-user-id', email: 'test@example.com' },
              },
              user: { id: 'test-user-id', email: 'test@example.com' },
            },
            error: null,
          }),
        },
      }

      const { createServerSupabaseClient, isValidSession } = await import('@/lib/auth/server-session')
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)
      vi.mocked(isValidSession).mockReturnValue(true)

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
      expect(data.user).toBeDefined()
      expect(data.message).toBe('Account created successfully')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should handle successful logout', async () => {
      const mockSupabase = {
        auth: {
          signOut: vi.fn().mockResolvedValue({ error: null }),
        },
      }

      const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
      vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
      })

      const response = await logoutPOST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Logged out successfully')
    })
  })
})
