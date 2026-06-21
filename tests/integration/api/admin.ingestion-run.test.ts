import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockRunAdminIngestionJob = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

vi.mock('@/lib/admin/ingestion/runAdminIngestionJob', () => ({
  runAdminIngestionJob: mockRunAdminIngestionJob,
}))

describe('POST /api/admin/ingestion/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('requires admin auth', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockRejectedValue(
      NextResponse.json({ ok: false }, { status: 403 })
    )

    const { POST } = await import('@/app/api/admin/ingestion/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/ingestion/run', {
        method: 'POST',
        body: JSON.stringify({ job: 'missing_ingest' }),
      })
    )

    expect(res.status).toBe(403)
  })

  it('rejects unknown job keys', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })

    const { POST } = await import('@/app/api/admin/ingestion/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/ingestion/run', {
        method: 'POST',
        body: JSON.stringify({ job: 'not_a_job' }),
      })
    )

    expect(res.status).toBe(400)
    expect(mockRunAdminIngestionJob).not.toHaveBeenCalled()
  })

  it('returns runner failure payload', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    mockRunAdminIngestionJob.mockResolvedValue({
      ok: false,
      job: 'missing_ingest',
      status: 'failed',
      duration_ms: 42,
      ran_at: '2026-06-21T10:00:00.000Z',
      error: 'column missing',
      stack_top: 'at runAdminIngestionJob',
    })

    const { POST } = await import('@/app/api/admin/ingestion/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/ingestion/run', {
        method: 'POST',
        body: JSON.stringify({ job: 'missing_ingest' }),
      })
    )
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('column missing')
    expect(mockRunAdminIngestionJob).toHaveBeenCalledWith('missing_ingest')
  })

  it('returns success payload', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    mockRunAdminIngestionJob.mockResolvedValue({
      ok: true,
      job: 'shadow_replay',
      status: 'success',
      duration_ms: 1200,
      ran_at: '2026-06-21T10:00:00.000Z',
      telemetry: { replayedCount: 5 },
    })

    const { POST } = await import('@/app/api/admin/ingestion/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/ingestion/run', {
        method: 'POST',
        body: JSON.stringify({ job: 'shadow_replay' }),
      })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('success')
    expect(body.telemetry.replayedCount).toBe(5)
  })
})
