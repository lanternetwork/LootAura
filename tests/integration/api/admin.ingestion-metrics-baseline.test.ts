import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockUpdate = vi.hoisted(() => vi.fn())
const mockInsert = vi.hoisted(() => vi.fn())
const mockFromBase = vi.hoisted(() => vi.fn())
const mockGetAdminDb = vi.hoisted(() => vi.fn(() => ({})))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: mockGetAdminDb,
  fromBase: mockFromBase,
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

describe('POST /api/admin/ingestion/metrics/baseline', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUpdate.mockReset()
    mockInsert.mockReset()
    mockFromBase.mockReset()
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { detail_first_metrics_baseline_at: '2026-05-22T01:00:00.000Z' },
            error: null,
          }),
        }),
      }),
    })
    mockInsert.mockResolvedValue({ error: null })
    mockFromBase.mockReturnValue({
      update: mockUpdate,
      insert: mockInsert,
    })
  })

  it('stores baseline timestamp for admin callers', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-test' } })

    const { POST } = await import('@/app/api/admin/ingestion/metrics/baseline/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/ingestion/metrics/baseline', {
        method: 'POST',
        body: '{}',
      })
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; detailFirstMetricsBaselineAt: string }
    expect(json.ok).toBe(true)
    expect(json.detailFirstMetricsBaselineAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns forbidden for non-admin', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockRejectedValue(
      NextResponse.json({ ok: false }, { status: 403 })
    )

    const { POST } = await import('@/app/api/admin/ingestion/metrics/baseline/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/ingestion/metrics/baseline', { method: 'POST' })
    )
    expect(res.status).toBe(403)
  })
})
