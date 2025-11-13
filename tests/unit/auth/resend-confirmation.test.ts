import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as resendPOST } from '@/app/api/auth/resend/route'

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

describe('Resend Confirmation Email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should resend confirmation email successfully', async () => {
    const mockSupabase = {
      auth: {
        resend: vi.fn().mockResolvedValue({
          data: {},
          error: null,
        }),
      },
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/auth/resend', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await resendPOST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe('Confirmation email sent')
    expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'test@example.com',
    })
  })

  it('should handle resend failure', async () => {
    const mockSupabase = {
      auth: {
        resend: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Rate limit exceeded' },
        }),
      },
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/auth/resend', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await resendPOST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.code).toBe('RESEND_FAILED')
    expect(data.error).toBe('Failed to resend verification email. Please try again.')
  })

  it('should reject invalid email', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/resend', {
      method: 'POST',
      body: JSON.stringify({
        email: 'invalid-email',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await resendPOST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid input data')
    expect(data.details).toBeDefined()
  })
})
