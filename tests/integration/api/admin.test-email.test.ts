import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
}))

describe('POST /api/admin/test-email', () => {
  let handler: (request: NextRequest) => Promise<Response>
  let assertAdminOrThrow: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const module = await import('@/app/api/admin/test-email/route')
    handler = module.POST

    const adminGate = await import('@/lib/auth/adminGate')
    assertAdminOrThrow = vi.mocked(adminGate.assertAdminOrThrow)

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://test.example.com')
  })

  it('returns 403 when admin check fails', async () => {
    const request = new NextRequest('http://localhost/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ to: 'user@example.com' }),
    })

    assertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden: Admin access required')
  })

  it('allows admin users to send test email', async () => {
    const request = new NextRequest('http://localhost/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ to: 'user@example.com' }),
    })

    const { sendEmail } = await import('@/lib/email/sendEmail')

    assertAdminOrThrow.mockResolvedValue({
      user: { id: 'admin-user-id', email: 'admin@example.com' },
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.to).toBe('user@example.com')
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        type: 'sale_created_confirmation',
      }),
    )
  })
})


