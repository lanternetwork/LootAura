import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodeQueue', () => ({
  processGeocodeQueueBatch: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  geocodePendingSales: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GEOCODE_BACKLOG_BATCH_SIZE
    process.env.NODE_ENV = 'test'
    process.env.VERCEL_ENV = 'preview'
  })

  it('processes queue and then drains DB backlog', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { processGeocodeQueueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const { GET } = await import('@/app/api/cron/geocode/route')

    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    vi.mocked(processGeocodeQueueBatch).mockResolvedValue({
      dequeued: 3,
      completed: 2,
      requeued: 1,
    })
    vi.mocked(geocodePendingSales).mockResolvedValue({
      claimed: 4,
      succeeded: 3,
      failedRetriable: 1,
      failedTerminal: 0,
      rate429Count: 0,
      processed: 4,
      publishTriggered: 3,
      publishOk: 2,
      publishFailed: 1,
    })

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(processGeocodeQueueBatch).toHaveBeenCalledWith(50)
    expect(geocodePendingSales).toHaveBeenCalledWith({ batchSizeOverride: 25 })
    expect(data.queue).toEqual({
      processed: 3,
      completed: 2,
      requeued: 1,
      failed: 0,
    })
    expect(data.backlog.claimed).toBe(4)
    expect(data.backlog.processed).toBe(4)
    expect(data.backlog.failed).toBe(1)
    expect(data.backlog.publishTriggered).toBe(3)
  })

  it('runs backlog drain when queue is empty', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { processGeocodeQueueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const { GET } = await import('@/app/api/cron/geocode/route')

    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    vi.mocked(processGeocodeQueueBatch).mockResolvedValue({
      dequeued: 0,
      completed: 0,
      requeued: 0,
    })
    vi.mocked(geocodePendingSales).mockResolvedValue({
      claimed: 2,
      succeeded: 2,
      failedRetriable: 0,
      failedTerminal: 0,
      rate429Count: 0,
      processed: 2,
      publishTriggered: 2,
      publishOk: 2,
      publishFailed: 0,
    })

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(processGeocodeQueueBatch).toHaveBeenCalledTimes(1)
    expect(geocodePendingSales).toHaveBeenCalledTimes(1)
    expect(data.queue.processed).toBe(0)
    expect(data.backlog.claimed).toBe(2)
  })

  it('caps backlog drain batch size from env at 100', async () => {
    process.env.GEOCODE_BACKLOG_BATCH_SIZE = '999'
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { processGeocodeQueueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const { GET } = await import('@/app/api/cron/geocode/route')

    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    vi.mocked(processGeocodeQueueBatch).mockResolvedValue({
      dequeued: 0,
      completed: 0,
      requeued: 0,
    })
    vi.mocked(geocodePendingSales).mockResolvedValue({
      claimed: 0,
      succeeded: 0,
      failedRetriable: 0,
      failedTerminal: 0,
      rate429Count: 0,
      processed: 0,
      publishTriggered: 0,
      publishOk: 0,
      publishFailed: 0,
    })

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    await GET(req)

    expect(geocodePendingSales).toHaveBeenCalledWith({ batchSizeOverride: 100 })
  })

  it('returns queue metrics even when backlog drain fails', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    const { processGeocodeQueueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const { GET } = await import('@/app/api/cron/geocode/route')

    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    vi.mocked(processGeocodeQueueBatch).mockResolvedValue({
      dequeued: 5,
      completed: 4,
      requeued: 1,
    })
    vi.mocked(geocodePendingSales).mockRejectedValue(new Error('backlog claim failed'))

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.queue).toEqual({
      processed: 5,
      completed: 4,
      requeued: 1,
      failed: 0,
    })
    expect(data.backlog.error).toBe('backlog claim failed')
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
  })
})

