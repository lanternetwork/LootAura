import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/establish-session/route'

const mockSupabaseClient = {
  auth: {
    setSession: vi.fn(),
  },
}

vi.mock('@/lib/auth/server-session', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock('@/lib/rateLimiter', () => ({
  createRateLimitMiddleware: vi.fn(() => () => ({ allowed: true })),
  RATE_LIMITS: { AUTH: {} },
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}))

vi.mock('@/lib/profile/ensureLootauraProfile', () => ({
  ensureLootauraProfileExists: vi.fn().mockResolvedValue({ ok: true, created: true }),
}))

describe('POST /api/auth/establish-session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('establishes session from hash-fragment tokens', async () => {
    mockSupabaseClient.auth.setSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' }, access_token: 'a', refresh_token: 'r' } },
      error: null,
    })

    const request = new NextRequest('https://example.com/api/auth/establish-session', {
      method: 'POST',
      body: JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        redirectTo: '/sales',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.redirectTo).toBe('/sales')
    expect(mockSupabaseClient.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    })
  })

  it('fails closed on invalid body', async () => {
    const request = new NextRequest('https://example.com/api/auth/establish-session', {
      method: 'POST',
      body: JSON.stringify({ access_token: 'only' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
