import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockAssertAdminOrThrow = vi.fn()
const mockIsCronAuthorized = vi.fn()
const mockAssertCronAuthorized = vi.fn()
const mockRunBounded = vi.fn()

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: unknown[]) => mockAssertAdminOrThrow(...args),
}))

vi.mock('@/lib/auth/cron', () => ({
  isCronAuthorized: (...args: unknown[]) => mockIsCronAuthorized(...args),
  assertCronAuthorized: (...args: unknown[]) => mockAssertCronAuthorized(...args),
}))

vi.mock('@/lib/geocode/geocodeDeadLetterReplay', () => ({
  runBoundedGeocodeDeadLetterReplay: (...args: unknown[]) => mockRunBounded(...args),
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: {
    ADMIN_TOOLS: 'ADMIN_TOOLS',
    ADMIN_HOURLY: 'ADMIN_HOURLY',
  },
}))

describe('POST /api/admin/geocode/replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsCronAuthorized.mockReturnValue(false)
    mockAssertAdminOrThrow.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com' },
    })
    mockRunBounded.mockResolvedValue({
      attempted: 2,
      eligible: 3,
      replayed: 2,
      skipped: 2,
      updateErrors: 0,
      lostRaces: 0,
    })
  })

  it('requires admin when not cron', async () => {
    mockAssertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))
    const { POST } = await import('@/app/api/admin/geocode/replay/route')
    const req = new NextRequest('http://localhost/api/admin/geocode/replay', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('allows cron bearer when authorized', async () => {
    mockIsCronAuthorized.mockReturnValue(true)
    mockAssertCronAuthorized.mockImplementation(() => {})
    mockAssertAdminOrThrow.mockReset()
    const { POST } = await import('@/app/api/admin/geocode/replay/route')
    const req = new NextRequest('http://localhost/api/admin/geocode/replay', {
      method: 'POST',
      body: JSON.stringify({ limit: 10 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockAssertAdminOrThrow).not.toHaveBeenCalled()
    expect(mockRunBounded).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        telemetryContext: { jobType: 'geocode.dead_letter.replay' },
      })
    )
  })

  it('returns bounded replay summary shape', async () => {
    const { POST } = await import('@/app/api/admin/geocode/replay/route')
    const req = new NextRequest('http://localhost/api/admin/geocode/replay', {
      method: 'POST',
      body: JSON.stringify({ limit: 50 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.attempted).toBe(2)
    expect(body.eligible).toBe(3)
    expect(body.replayed).toBe(2)
    expect(body.skipped).toBe(2)
    expect(body.updateErrors).toBe(0)
    expect(body.lostRaces).toBe(0)
    expect(mockRunBounded).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
      })
    )
  })

  it('defaults limit when omitted', async () => {
    const { POST } = await import('@/app/api/admin/geocode/replay/route')
    const req = new NextRequest('http://localhost/api/admin/geocode/replay', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    await POST(req)
    expect(mockRunBounded).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }))
  })

  it('caps limit at 200', async () => {
    const { POST } = await import('@/app/api/admin/geocode/replay/route')
    const req = new NextRequest('http://localhost/api/admin/geocode/replay', {
      method: 'POST',
      body: JSON.stringify({ limit: 9999 }),
      headers: { 'content-type': 'application/json' },
    })
    await POST(req)
    expect(mockRunBounded).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }))
  })
})
