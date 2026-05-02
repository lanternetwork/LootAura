import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  ENV_SERVER: {
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  },
}))

const hoisted = vi.hoisted(() => ({
  geocodeIngestedSaleById: vi.fn(),
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  geocodeIngestedSaleById: hoisted.geocodeIngestedSaleById,
}))

describe('geocodeQueue', () => {
  beforeEach(() => {
    vi.resetModules()
    hoisted.geocodeIngestedSaleById.mockReset()
    hoisted.geocodeIngestedSaleById.mockResolvedValue({
      outcome: 'success',
      published: false,
    })
  })

  it('requeue does not cap by job.attempts (visibility counter only)', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/set')) {
        return new Response(JSON.stringify({ result: 'OK' }))
      }
      if (u.endsWith('/expire')) {
        return new Response(JSON.stringify({ result: 1 }))
      }
      if (u.endsWith('/lpush')) {
        return new Response(JSON.stringify({ result: 1 }))
      }
      return new Response(JSON.stringify({ result: null }))
    })

    const { requeue } = await import('@/lib/ingestion/geocodeQueue')
    expect(await requeue({ jobId: 'job-a', saleId: 'sale-1', attempts: 99, priority: 'normal' })).toEqual({ ok: true })
  })

  it('processGeocodeQueueBatch requeues when worker returns retriable geocode_failed', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    hoisted.geocodeIngestedSaleById.mockResolvedValue({
      outcome: 'geocode_failed',
      retriable: true,
    })

    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/rpop')) {
        return new Response(JSON.stringify({ result: 'job-retry' }))
      }
      if (u.endsWith('/get')) {
        return new Response(
          JSON.stringify({
            result: JSON.stringify({ saleId: '00000000-0000-4000-8000-0000000000aa', attempts: 5, priority: 'normal' }),
          })
        )
      }
      if (u.endsWith('/set') || u.endsWith('/expire') || u.endsWith('/lpush')) {
        return new Response(JSON.stringify({ result: 'OK' }))
      }
      return new Response(JSON.stringify({ result: null }))
    })

    const { processGeocodeQueueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const summary = await processGeocodeQueueBatch(2)

    expect(summary.dequeued).toBe(1)
    expect(summary.requeued).toBe(1)
    expect(summary.completed).toBe(0)
  })

  it('dequeueBatch restores job id when payload is missing', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    let getCalls = 0
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/rpop')) {
        return new Response(JSON.stringify({ result: 'job-missing' }))
      }
      if (u.endsWith('/get')) {
        getCalls += 1
        return new Response(JSON.stringify({ result: null }))
      }
      if (u.endsWith('/lpush')) {
        return new Response(JSON.stringify({ result: 1 }))
      }
      return new Response(JSON.stringify({ result: null }))
    })

    const { dequeueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const jobs = await dequeueBatch(5)
    expect(jobs).toEqual([])
    expect(getCalls).toBe(1)
    const lpushCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/lpush'))
    expect(lpushCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('processGeocodeQueueBatch calls geocodeIngestedSaleById and completes on success', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/rpop')) {
        return new Response(JSON.stringify({ result: 'job-1' }))
      }
      if (u.endsWith('/get')) {
        return new Response(
          JSON.stringify({
            result: JSON.stringify({ saleId: '00000000-0000-4000-8000-000000000099', attempts: 0, priority: 'high' }),
          })
        )
      }
      if (u.endsWith('/del')) {
        return new Response(JSON.stringify({ result: 1 }))
      }
      return new Response(JSON.stringify({ result: null }))
    })

    const { processGeocodeQueueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const summary = await processGeocodeQueueBatch(3)

    expect(summary.dequeued).toBe(1)
    expect(summary.completed).toBe(1)
    expect(hoisted.geocodeIngestedSaleById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000099')
  })
})
