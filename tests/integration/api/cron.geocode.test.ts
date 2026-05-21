import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { INGESTION_ORCHESTRATION_DEFAULTS } from '@/lib/ingestion/ingestionOrchestrationDefaults'

const { recordGeocodeCronOrchestrationRun } = vi.hoisted(() => ({
  recordGeocodeCronOrchestrationRun: vi.fn().mockResolvedValue(undefined),
}))

const mockResolveAdaptiveThroughputForCron = vi.hoisted(() => vi.fn())
const mockRunWithGeocodePipelineLease = vi.hoisted(() => vi.fn())
const mockRunGeocodeCronPipeline = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodePipelineLease', () => ({
  runWithGeocodePipelineLease: mockRunWithGeocodePipelineLease,
}))

vi.mock('@/lib/ingestion/geocodeCronPipeline', () => ({
  runGeocodeCronPipeline: mockRunGeocodeCronPipeline,
}))

vi.mock('@/lib/ingestion/orchestrationMetrics', () => ({
  recordGeocodeCronOrchestrationRun,
}))

vi.mock('@/lib/ingestion/adaptiveThroughputSignals', () => ({
  resolveAdaptiveThroughputForCron: mockResolveAdaptiveThroughputForCron,
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  generateOperationId: vi.fn(() => 'test-op-id'),
}))

describe('GET /api/cron/geocode', () => {
  beforeEach(async () => {
    const env = process.env as Record<string, string | undefined>
    vi.clearAllMocks()
    recordGeocodeCronOrchestrationRun.mockResolvedValue(undefined)
    const { installAdaptiveThroughputCronMock } = await import('../../helpers/mockAdaptiveThroughputForCron')
    installAdaptiveThroughputCronMock(mockResolveAdaptiveThroughputForCron)
    delete env.GEOCODE_BACKLOG_BATCH_SIZE
    env.NODE_ENV = 'test'
    env.VERCEL_ENV = 'preview'

    mockRunWithGeocodePipelineLease.mockImplementation(async ({ execute }) => ({
      ok: true,
      skipped: false,
      result: await execute(),
      lease: { acquired: true, owner: 'test', staleRecovered: false, cursor: 0 },
    }))
  })

  it('processes queue and then drains DB backlog under pipeline lease', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { GET } = await import('@/app/api/cron/geocode/route')

    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    mockRunGeocodeCronPipeline.mockResolvedValue({
      queue: { processed: 3, completed: 2, requeued: 1, failed: 0 },
      backlog: {
        batch_size: 15,
        claimed: 4,
        processed: 4,
        failed: 1,
        publishTriggered: 3,
        duration_ms: 12,
        error: null,
        rate429Count: 0,
      },
      replay: {
        attempted: 5,
        eligible: 3,
        replayed: 2,
        skipped: 0,
        updateErrors: 0,
        lostRaces: 0,
        skippedDueTo429Pressure: false,
      },
    })

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockRunGeocodeCronPipeline).toHaveBeenCalledWith({
      queueBatchSize: INGESTION_ORCHESTRATION_DEFAULTS.geocodeCronQueueBatchSize,
      backlogBatchSize: INGESTION_ORCHESTRATION_DEFAULTS.geocodeBacklogBatchSize,
      concurrencyCeiling: INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling,
      telemetryContext: expect.objectContaining({ jobType: 'cron.geocode' }),
    })
    expect(data.queue).toEqual({
      processed: 3,
      completed: 2,
      requeued: 1,
      failed: 0,
    })
    expect(data.backlog.claimed).toBe(4)
    expect(data.replay.replayed).toBe(2)
    expect(recordGeocodeCronOrchestrationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        backlogClaimed: 4,
        queueProcessed: 3,
        rate429Count: 0,
        ok: true,
        effectiveGeocodeQueueBatch: INGESTION_ORCHESTRATION_DEFAULTS.geocodeCronQueueBatchSize,
        effectiveGeocodeConcurrency: INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling,
      })
    )
  })

  it('returns skipped when pipeline lease is active', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { GET } = await import('@/app/api/cron/geocode/route')

    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    mockRunWithGeocodePipelineLease.mockResolvedValue({
      ok: true,
      skipped: true,
      reason: 'active_lease',
      lease: { acquired: false, owner: '', staleRecovered: false, cursor: 0, reason: 'active_lease' },
    })

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.skipped).toBe(true)
    expect(data.skip_reason).toBe('active_lease')
    expect(mockRunGeocodeCronPipeline).not.toHaveBeenCalled()
  })

  it('returns 500 when pipeline throws', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { GET } = await import('@/app/api/cron/geocode/route')

    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    mockRunGeocodeCronPipeline.mockRejectedValue(new Error('backlog claim failed'))

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe('backlog claim failed')
    expect(recordGeocodeCronOrchestrationRun).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'backlog claim failed' })
    )
  })

  it('returns 401 when cron auth fails', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { GET } = await import('@/app/api/cron/geocode/route')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {
      throw NextResponse.json(
        { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    })

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(recordGeocodeCronOrchestrationRun).not.toHaveBeenCalled()
  })
})
