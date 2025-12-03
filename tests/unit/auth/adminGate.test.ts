import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

describe('assertAdminOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('forbids non-admin users in production even when NEXT_PUBLIC_DEBUG is true', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-id', email: 'user@example.com' } },
      error: null,
    })

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_DEBUG', 'true')
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')

    ;(createSupabaseServerClient as any).mockReturnValue({
      auth: { getUser: mockGetUser },
    })

    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')

    await expect(assertAdminOrThrow(new Request('http://localhost'))).rejects.toMatchObject({
      status: 403,
    })
    expect(mockGetUser).toHaveBeenCalledTimes(1)
  })

  it('allows non-admin users in non-production when NEXT_PUBLIC_DEBUG is true', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-id', email: 'user@example.com' } },
      error: null,
    })

    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_DEBUG', 'true')
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')

    ;(createSupabaseServerClient as any).mockReturnValue({
      auth: { getUser: mockGetUser },
    })

    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')

    const result = await assertAdminOrThrow(new Request('http://localhost'))
    expect(result.user.id).toBe('user-id')
    expect(result.user.email).toBe('user@example.com')
  })
})


