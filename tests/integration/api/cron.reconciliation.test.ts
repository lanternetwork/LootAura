import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockReconcile = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    attempted: 2,
    processed: 2,
    changed: 0,
    unchanged: 2,
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
    persistenceApplied: true,
    dryRun: false,
    applySafeSync: true,
    salesSyncAttempted: 0,
    salesSyncUpdated: 0,
    salesSyncSkipped: 0,
    descriptionsUpdated: 0,
    imagesUpdated: 0,
    schedulesUpdated: 0,
    titlesUpdated: 0,
    manualReviewRequired: 0,
  })
)

vi.mock('@/lib/reconciliation/reconcileExternalSources', () => ({
  reconcileExternalSources: mockReconcile,
}))

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
  isCronAuthorized: vi.fn(() => true),
}))

describe('/api/cron/reconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.CRON_RECONCILIATION_BATCH_LIMIT
    mockReconcile.mockClear()
  })

  it('rejects when cron auth fails', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {
      throw NextResponse.json({ ok: false }, { status: 401 })
    })
    const { GET } = await import('@/app/api/cron/reconciliation/route')
    const res = await GET(new NextRequest('http://localhost/api/cron/reconciliation'))
    expect(res.status).toBe(401)
    expect(mockReconcile).not.toHaveBeenCalled()
  })

  it('runs reconcile with dryRun false, applySafeSync true, bounded limit', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {})

    const { GET } = await import('@/app/api/cron/reconciliation/route')
    const res = await GET(new NextRequest('http://localhost/api/cron/reconciliation'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(true)
    expect(json.job).toBe('reconciliation_cron')
    expect(json.dryRun).toBe(false)
    expect(json.applySafeSync).toBe(true)
    expect(json).not.toHaveProperty('urls')
    expect(mockReconcile).toHaveBeenCalledTimes(1)
    const opts = mockReconcile.mock.calls[0]![0] as {
      dryRun: boolean
      applySafeSync: boolean
      aggregateTelemetryOnly: boolean
      limit: number
    }
    expect(opts.dryRun).toBe(false)
    expect(opts.applySafeSync).toBe(true)
    expect(opts.aggregateTelemetryOnly).toBe(true)
    expect(opts.limit).toBe(20)
  })

  it('caps limit via CRON_RECONCILIATION_BATCH_LIMIT env', async () => {
    process.env.CRON_RECONCILIATION_BATCH_LIMIT = '12'
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    const { GET } = await import('@/app/api/cron/reconciliation/route')
    await GET(new NextRequest('http://localhost/api/cron/reconciliation'))
    const opts = mockReconcile.mock.calls[0]![0] as { limit: number }
    expect(opts.limit).toBe(12)
  })
})
