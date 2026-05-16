import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockAssertAdmin, mockIsCron, mockAssertCron, mockReconcile } = vi.hoisted(() => ({
  mockAssertAdmin: vi.fn(),
  mockIsCron: vi.fn(),
  mockAssertCron: vi.fn(),
  mockReconcile: vi.fn(),
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...a: unknown[]) => mockAssertAdmin(...a),
}))

vi.mock('@/lib/auth/cron', () => ({
  isCronAuthorized: (...a: unknown[]) => mockIsCron(...a),
  assertCronAuthorized: (...a: unknown[]) => mockAssertCron(...a),
}))

vi.mock('@/lib/reconciliation/reconcileExternalSources', () => ({
  reconcileExternalSources: (...a: unknown[]) => mockReconcile(...a),
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: { ADMIN_TOOLS: 'ADMIN_TOOLS', ADMIN_HOURLY: 'ADMIN_HOURLY' },
}))

const fullResult = {
  attempted: 3,
  processed: 2,
  changed: 1,
  unchanged: 1,
  failed: 0,
  parseFailed: 0,
  sourceMissingSoft: 0,
  placeholderResolved: 0,
  unsupportedSource: 0,
  refreshCapability: {
    serverRefetchSupported: 2,
    extensionAssistedRequired: 0,
    unsupportedForReconciliation: 0,
  },
  persistenceApplied: false,
  dryRun: true,
  applySafeSync: false,
  salesSyncAttempted: 0,
  salesSyncUpdated: 0,
  salesSyncSkipped: 0,
  descriptionsUpdated: 0,
  imagesUpdated: 0,
  schedulesUpdated: 0,
  titlesUpdated: 0,
  manualReviewRequired: 0,
  candidatePageRpcOk: true,
  candidatePageRpcErrorCode: null,
}

describe('POST /api/admin/reconciliation/run', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAssertAdmin.mockReset()
    mockIsCron.mockReset()
    mockAssertCron.mockReset()
    mockReconcile.mockReset()
    mockReconcile.mockResolvedValue(fullResult)
  })

  it('requires admin when not cron', async () => {
    mockIsCron.mockReturnValue(false)
    mockAssertAdmin.mockRejectedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const { POST } = await import('@/app/api/admin/reconciliation/run/route')
    const res = await POST(new NextRequest('http://localhost/api/admin/reconciliation/run', { method: 'POST' }))
    expect(res.status).toBe(403)
    expect(mockReconcile).not.toHaveBeenCalled()
  })

  it('accepts cron bearer without admin', async () => {
    mockIsCron.mockReturnValue(true)
    mockAssertCron.mockImplementation(() => {})
    const { POST } = await import('@/app/api/admin/reconciliation/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/reconciliation/run', {
        method: 'POST',
        headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    )
    expect(res.status).toBe(200)
    expect(mockAssertAdmin).not.toHaveBeenCalled()
    expect(mockReconcile).toHaveBeenCalledTimes(1)
    expect(mockReconcile.mock.calls[0][0]).toMatchObject({
      dryRun: true,
      aggregateTelemetryOnly: true,
      applySafeSync: false,
    })
  })

  it('defaults dryRun true and passes filters to worker', async () => {
    mockIsCron.mockReturnValue(false)
    mockAssertAdmin.mockResolvedValue({ user: { id: 'u1' } })
    const { POST } = await import('@/app/api/admin/reconciliation/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 50,
          sourcePlatform: 'external_page_source',
          onlyPlaceholder: true,
        }),
      })
    )
    expect(res.status).toBe(200)
    expect(mockReconcile.mock.calls[0][0]).toMatchObject({
      limit: 50,
      dryRun: true,
      sourcePlatform: 'external_page_source',
      onlyPlaceholder: true,
      aggregateTelemetryOnly: true,
      applySafeSync: false,
    })
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(true)
    expect(json.dryRun).toBe(true)
    expect(json.persistenceApplied).toBe(false)
    expect(json).not.toHaveProperty('urls')
  })

  it('passes dryRun false for metadata persistence', async () => {
    mockIsCron.mockReturnValue(false)
    mockAssertAdmin.mockResolvedValue({ user: { id: 'u1' } })
    mockReconcile.mockResolvedValue({ ...fullResult, dryRun: false, persistenceApplied: true })
    const { POST } = await import('@/app/api/admin/reconciliation/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
    )
    expect(res.status).toBe(200)
    expect(mockReconcile.mock.calls[0][0]).toMatchObject({ dryRun: false })
    const json = (await res.json()) as { persistenceApplied: boolean; dryRun: boolean }
    expect(json.persistenceApplied).toBe(true)
    expect(json.dryRun).toBe(false)
  })

  it('passes applySafeSync true when explicitly requested with dryRun false', async () => {
    mockIsCron.mockReturnValue(false)
    mockAssertAdmin.mockResolvedValue({ user: { id: 'u1' } })
    mockReconcile.mockResolvedValue({ ...fullResult, dryRun: false, applySafeSync: true, salesSyncUpdated: 1 })
    const { POST } = await import('@/app/api/admin/reconciliation/run/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, applySafeSync: true }),
      })
    )
    expect(res.status).toBe(200)
    expect(mockReconcile.mock.calls[0][0]).toMatchObject({ dryRun: false, applySafeSync: true })
    const json = (await res.json()) as { applySafeSync: boolean; publicSalesUpdated: boolean; salesSyncUpdated: number }
    expect(json.applySafeSync).toBe(true)
    expect(json.publicSalesUpdated).toBe(true)
    expect(json.salesSyncUpdated).toBe(1)
  })

  it('enforces limit cap via parse before worker', async () => {
    mockIsCron.mockReturnValue(false)
    mockAssertAdmin.mockResolvedValue({ user: { id: 'u1' } })
    const { POST } = await import('@/app/api/admin/reconciliation/run/route')
    await POST(
      new NextRequest('http://localhost/api/admin/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500 }),
      })
    )
    const opts = mockReconcile.mock.calls[0]?.[0] as { limit: number }
    expect(opts.limit).toBe(100)
  })
})
