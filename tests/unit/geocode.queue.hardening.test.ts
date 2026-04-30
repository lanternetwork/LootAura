import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGeocodeById = vi.fn()

vi.mock('@/lib/env', () => ({
  ENV_SERVER: {
    UPSTASH_REDIS_REST_URL: 'https://upstash.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'token-1234567890',
  },
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  MAX_GEOCODE_RETRIES: 5,
  geocodeIngestedSaleById: (...args: unknown[]) => mockGeocodeById(...args),
  publishAfterGeocodeSuccess: vi.fn().mockResolvedValue(undefined),
}))

describe('geocode queue hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGeocodeById.mockReset()
  })

  it('returns queue metrics with last run stats', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const command = url.split('/').pop()
      if (command === 'llen') {
        const body = JSON.parse(String(init?.body || '[]'))
        const key = body[0]
        if (key === 'geocode_jobs:high') return { ok: true, json: async () => ({ result: 2 }) }
        if (key === 'geocode_jobs:normal') return { ok: true, json: async () => ({ result: 3 }) }
      }
      if (command === 'zcard') return { ok: true, json: async () => ({ result: 1 }) }
      if (command === 'get') {
        return {
          ok: true,
          json: async () => ({
            result: JSON.stringify({
              last_run_processed: 6,
              last_run_failed: 1,
              last_run_duration_ms: 321,
            }),
          }),
        }
      }
      return { ok: true, json: async () => ({ result: null }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getGeocodeQueueMetrics } = await import('@/lib/ingestion/geocodeQueue')
    const metrics = await getGeocodeQueueMetrics()

    expect(metrics.queue_length_high).toBe(2)
    expect(metrics.queue_length_normal).toBe(3)
    expect(metrics.queue_length_delayed).toBe(1)
    expect(metrics.total_jobs_pending).toBe(6)
    expect(metrics.recent_processing_stats.last_run_processed).toBe(6)
  })

  it('throttles high priority jobs to normal queue', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const command = url.split('/').pop()
      const args = JSON.parse(String(init?.body || '[]'))
      if (command === 'zrangebyscore') return { ok: true, json: async () => ({ result: [] }) }
      if (command === 'rpop') {
        const key = args[0]
        if (key === 'geocode_jobs:high') {
          return {
            ok: true,
            json: async () => ({ result: JSON.stringify({ sale_id: 'sale-1', priority: 'HIGH' }) }),
          }
        }
        return { ok: true, json: async () => ({ result: null }) }
      }
      if (command === 'incr') return { ok: true, json: async () => ({ result: 999 }) }
      if (command === 'expire') return { ok: true, json: async () => ({ result: 1 }) }
      if (command === 'lpush') return { ok: true, json: async () => ({ result: 1 }) }
      return { ok: true, json: async () => ({ result: null }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    mockGeocodeById.mockResolvedValue({ success: true, terminalFailure: false, attemptCount: 1 })

    const { processGeocodeQueueBatch } = await import('@/lib/ingestion/geocodeQueue')
    const result = await processGeocodeQueueBatch()

    expect(result.processed).toBe(0)
    expect(mockGeocodeById).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalled()
  })
})
