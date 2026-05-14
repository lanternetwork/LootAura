import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockAssertAdmin, mockSummary, mockGetAdminDb } = vi.hoisted(() => ({
  mockAssertAdmin: vi.fn(),
  mockSummary: vi.fn(),
  mockGetAdminDb: vi.fn(),
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...a: unknown[]) => mockAssertAdmin(...a),
}))

vi.mock('@/lib/reconciliation/reconciliationHealthSummary', () => ({
  getReconciliationHealthSummary: (...a: unknown[]) => mockSummary(...a),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockGetAdminDb(),
  fromBase: vi.fn(),
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: { ADMIN_TOOLS: 'ADMIN_TOOLS', ADMIN_HOURLY: 'ADMIN_HOURLY' },
}))

describe('GET /api/admin/reconciliation/health', () => {
  beforeEach(() => {
    vi.resetAllModules()
    mockAssertAdmin.mockReset()
    mockSummary.mockReset()
    mockGetAdminDb.mockReturnValue({})
  })

  it('returns aggregate summary for admins', async () => {
    mockAssertAdmin.mockResolvedValue({ user: { id: 'admin-test' } })
    mockSummary.mockResolvedValue({
      candidateIngestRowsApprox: 12,
      placeholderFlaggedCount: 3,
      statusParseFailedCount: 1,
      statusMissingSoftCount: 2,
      changedLast24hCount: 4,
      staleSyncApproxCount: 5,
    })
    const { GET } = await import('@/app/api/admin/reconciliation/health/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reconciliation/health'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      summary: Record<string, number>
    }
    expect(body.ok).toBe(true)
    expect(body.summary.candidateIngestRowsApprox).toBe(12)
    expect(mockSummary).toHaveBeenCalledTimes(1)
  })

  it('returns 403 when admin gate rejects', async () => {
    mockAssertAdmin.mockRejectedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const { GET } = await import('@/app/api/admin/reconciliation/health/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reconciliation/health'))
    expect(res.status).toBe(403)
  })
})
