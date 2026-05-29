import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/update-password/route'

const mockUpdateUser = vi.fn()
const mockSetSession = vi.fn()

vi.mock('@/lib/auth/server-session', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
    },
  })),
}))

vi.mock('@/lib/rateLimiter', () => ({
  createRateLimitMiddleware: vi.fn(() => () => ({ allowed: true })),
  RATE_LIMITS: { AUTH: {} },
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

describe('POST /api/auth/update-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockSetSession.mockResolvedValue({
      data: { session: { access_token: 'a', refresh_token: 'r' } },
      error: null,
    })
  })

  it('updates password using session cookies when only password is sent', async () => {
    const request = new NextRequest('http://localhost/api/auth/update-password', {
      method: 'POST',
      body: JSON.stringify({ password: 'Password1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockSetSession).not.toHaveBeenCalled()
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Password1' })
  })

  it('sets session from tokens before updating password', async () => {
    const request = new NextRequest('http://localhost/api/auth/update-password', {
      method: 'POST',
      body: JSON.stringify({
        password: 'Password1',
        access_token: 'access',
        refresh_token: 'refresh',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    })
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Password1' })
  })

  it('rejects weak passwords', async () => {
    const request = new NextRequest('http://localhost/api/auth/update-password', {
      method: 'POST',
      body: JSON.stringify({ password: 'short' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})
