import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/auth/confirm/route'

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server')
  return {
    ...actual,
    NextResponse: {
      redirect: vi.fn((url) => ({ url: url.toString(), type: 'redirect' })),
    },
  }
})

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => null),
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}))

const mockSupabaseClient = {
  auth: {
    verifyOtp: vi.fn(),
  },
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock('@/lib/profile/ensureLootauraProfile', () => ({
  ensureLootauraProfileExists: vi.fn().mockResolvedValue({ ok: true, created: true }),
}))

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('redirects to reset password after successful recovery verifyOtp', async () => {
    mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: { user: { id: 'user123' } } },
      error: null,
    })

    const request = new NextRequest(
      'https://example.com/auth/confirm?token_hash=abc&type=recovery&next=%2Fauth%2Freset-password'
    )

    const response = await GET(request)

    expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'abc',
      type: 'recovery',
    })
    expect(response.url).toContain('/auth/reset-password')
    expect(response.url).not.toContain('token_hash')
  })

  it('redirects recovery failures to reset password with error', async () => {
    mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
      data: null,
      error: { message: 'expired' },
    })

    const request = new NextRequest(
      'https://example.com/auth/confirm?token_hash=bad&type=recovery'
    )

    const response = await GET(request)

    expect(response.url).toContain('/auth/reset-password')
    expect(response.url).toContain('error=verify_failed')
  })

  it('redirects non-recovery failures to auth error page', async () => {
    mockSupabaseClient.auth.verifyOtp.mockResolvedValueOnce({
      data: null,
      error: { message: 'bad' },
    })

    const request = new NextRequest(
      'https://example.com/auth/confirm?token_hash=bad&type=signup'
    )

    const response = await GET(request)

    expect(response.url).toContain('/auth/error')
    expect(response.url).toContain('verify_failed')
  })

  it('redirects missing params on recovery to reset password', async () => {
    const request = new NextRequest(
      'https://example.com/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
    )

    const response = await GET(request)

    expect(response.url).toContain('/auth/reset-password')
    expect(response.url).toContain('missing_otp_params')
  })
})
