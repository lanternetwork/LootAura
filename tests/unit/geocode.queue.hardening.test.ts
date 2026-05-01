import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGeocodeById = vi.fn()
const warnLogger = vi.fn()
const infoLogger = vi.fn()
const errorLogger = vi.fn()
const dbMaybeSingle = vi.fn()
const dbUpdateEq = vi.fn()
const dbUpdate = vi.fn()
const dbSelectEq = vi.fn()
const dbSelect = vi.fn()
const fromBaseMock = vi.fn()
const getAdminDbMock = vi.fn(() => ({}))

vi.mock('@/lib/env', () => ({
  ENV_SERVER: {
    UPSTASH_REDIS_REST_URL: 'https://upstash.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'token-1234567890',
  },
}))

vi.mock('@/lib/log', () => ({
  logger: {
    warn: (...args: unknown[]) => warnLogger(...args),
    info: (...args: unknown[]) => infoLogger(...args),
    error: (...args: unknown[]) => errorLogger(...args),
  },
}))

vi.mock('@/lib/ingestion/geocodeWorker', () => ({
  MAX_GEOCODE_RETRIES: 5,
  geocodeIngestedSaleById: (...args: unknown[]) => mockGeocodeById(...args),
  publishAfterGeocodeSuccess: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => getAdminDbMock(),
  fromBase: (...args: unknown[]) => fromBaseMock(...args),
}))

type RedisState = {
  high: string[]
  normal: string[]
  delayed: Array<{ score: number; member: string }>
  counters: Map<string, number>
  kv: Map<string, string>
}

function createRedisState(): RedisState {
  return {
    high: [],
    normal: [],
    delayed: [],
    counters: new Map(),
    kv: new Map(),
  }
}

function redisFetchMock(state: RedisState) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const command = url.split('/').pop()
    const args = JSON.parse(String(init?.body || '[]'))
    switch (command) {
      case 'llen': {
        const key = String(args[0] || '')
        if (key === 'geocode_jobs:high') return { ok: true, json: async () => ({ result: state.high.length }) }
        if (key === 'geocode_jobs:normal') return { ok: true, json: async () => ({ result: state.normal.length }) }
        return { ok: true, json: async () => ({ result: 0 }) }
      }
      case 'zcard':
        return { ok: true, json: async () => ({ result: state.delayed.length }) }
      case 'get': {
        const key = String(args[0] || '')
        return { ok: true, json: async () => ({ result: state.kv.get(key) ?? null }) }
      }
      case 'set': {
        const key = String(args[0] || '')
        const value = String(args[1] ?? '')
        state.kv.set(key, value)
        return { ok: true, json: async () => ({ result: 'OK' }) }
      }
      case 'zrangebyscore': {
        const max = args[2] === '-inf' ? Number.MAX_SAFE_INTEGER : Number(args[2])
        const limit = Number(args[5] || 100)
        const sorted = [...state.delayed].sort((a, b) => a.score - b.score)
        const members = sorted.filter((row) => row.score <= max).slice(0, limit).map((row) => row.member)
        return { ok: true, json: async () => ({ result: members }) }
      }
      case 'zrem': {
        const member = String(args[1] ?? '')
        const before = state.delayed.length
        state.delayed = state.delayed.filter((row) => row.member !== member)
        return { ok: true, json: async () => ({ result: before === state.delayed.length ? 0 : 1 }) }
      }
      case 'rpop': {
        const key = String(args[0] || '')
        if (key === 'geocode_jobs:high') {
          return { ok: true, json: async () => ({ result: state.high.pop() ?? null }) }
        }
        if (key === 'geocode_jobs:normal') {
          return { ok: true, json: async () => ({ result: state.normal.pop() ?? null }) }
        }
        return { ok: true, json: async () => ({ result: null }) }
      }
      case 'lpush': {
        const key = String(args[0] || '')
        const payload = String(args[1] || '')
        if (key === 'geocode_jobs:high') state.high.unshift(payload)
        if (key === 'geocode_jobs:normal') state.normal.unshift(payload)
        return { ok: true, json: async () => ({ result: 1 }) }
      }
      case 'zadd': {
        const score = Number(args[1])
        const member = String(args[2] || '')
        state.delayed.push({ score, member })
        return { ok: true, json: async () => ({ result: 1 }) }
      }
      case 'incr': {
        const key = String(args[0] || '')
        const next = (state.counters.get(key) ?? 0) + 1
        state.counters.set(key, next)
        return { ok: true, json: async () => ({ result: next }) }
      }
      case 'expire':
        return { ok: true, json: async () => ({ result: 1 }) }
      default:
        return { ok: true, json: async () => ({ result: null }) }
    }
  })
}

describe('geocode queue hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGeocodeById.mockReset()
    warnLogger.mockReset()
    infoLogger.mockReset()
    errorLogger.mockReset()
    dbMaybeSingle.mockReset()
    dbUpdateEq.mockReset()
    dbUpdate.mockReset()
    dbSelectEq.mockReset()
    dbSelect.mockReset()
    fromBaseMock.mockReset()
    getAdminDbMock.mockReset()
    getAdminDbMock.mockReturnValue({})

    dbMaybeSingle.mockResolvedValue({ data: { id: 'sale-terminal', status: 'needs_geocode', failure_reasons: [] } })
    dbUpdateEq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
    dbUpdate.mockReturnValue({ eq: dbUpdateEq })
    dbSelectEq.mockReturnValue({ maybeSingle: dbMaybeSingle })
    dbSelect.mockReturnValue({ eq: dbSelectEq })
    fromBaseMock.mockReturnValue({
      select: dbSelect,
      update: dbUpdate,
    })

    process.env.GEOCODE_QUEUE_BATCH_SIZE = '8'
    process.env.GEOCODE_QUEUE_MAX_BATCHES = '3'
    process.env.GEOCODE_QUEUE_RETRY_BASE_MS = '1'
    process.env.GEOCODE_QUEUE_RETRY_MAX_MS = '1'
    process.env.GEOCODE_QUEUE_MAX_IDLE_LOOPS_FACTOR = '2'
    process.env.MAX_HIGH_PER_MINUTE = '60'
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
    delete process.env.GEOCODE_QUEUE_BATCH_SIZE
    delete process.env.GEOCODE_QUEUE_MAX_BATCHES
    delete process.env.GEOCODE_QUEUE_RETRY_BASE_MS
    delete process.env.GEOCODE_QUEUE_RETRY_MAX_MS
    delete process.env.GEOCODE_QUEUE_MAX_IDLE_LOOPS_FACTOR
    delete process.env.MAX_HIGH_PER_MINUTE
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

  it('drains queue completely under normal conditions', async () => {
    const state = createRedisState()
    state.high.push(
      JSON.stringify({ sale_id: 'sale-high-1', priority: 'HIGH' }),
      JSON.stringify({ sale_id: 'sale-high-2', priority: 'HIGH' })
    )
    state.normal.push(
      JSON.stringify({ sale_id: 'sale-normal-1', priority: 'NORMAL' }),
      JSON.stringify({ sale_id: 'sale-normal-2', priority: 'NORMAL' })
    )
    const fetchMock = redisFetchMock(state)
    vi.stubGlobal('fetch', fetchMock)

    const processedSaleIds: string[] = []
    mockGeocodeById.mockImplementation(async (saleId: string) => {
      processedSaleIds.push(saleId)
      return { success: true, terminalFailure: false, attemptCount: 1 }
    })

    const { runGeocodeQueueWorker, getGeocodeQueueMetrics } = await import('@/lib/ingestion/geocodeQueue')
    const summary = await runGeocodeQueueWorker()
    const metrics = await getGeocodeQueueMetrics()

    expect(summary.processed).toBe(4)
    expect(summary.succeeded).toBe(4)
    expect(processedSaleIds.sort()).toEqual(['sale-high-1', 'sale-high-2', 'sale-normal-1', 'sale-normal-2'])
    expect(metrics.total_jobs_pending).toBe(0)
    expect(metrics.queue_length_high).toBe(0)
    expect(metrics.queue_length_normal).toBe(0)
    expect(metrics.queue_length_delayed).toBe(0)
  })

  it('retries failed jobs and eventually succeeds without exceeding retry bounds', async () => {
    const state = createRedisState()
    state.normal.push(JSON.stringify({ sale_id: 'sale-retry', priority: 'NORMAL' }))
    const fetchMock = redisFetchMock(state)
    vi.stubGlobal('fetch', fetchMock)

    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const attemptsBySale: Record<string, number> = {}
    mockGeocodeById.mockImplementation(async (saleId: string) => {
      const nextAttempt = (attemptsBySale[saleId] ?? 0) + 1
      attemptsBySale[saleId] = nextAttempt
      if (nextAttempt < 3) {
        return { success: false, terminalFailure: false, attemptCount: nextAttempt }
      }
      return { success: true, terminalFailure: false, attemptCount: nextAttempt }
    })

    const { processGeocodeQueueBatch, getGeocodeQueueMetrics } = await import('@/lib/ingestion/geocodeQueue')
    const first = await processGeocodeQueueBatch()
    now += 5
    const second = await processGeocodeQueueBatch()
    now += 5
    const third = await processGeocodeQueueBatch()
    const metrics = await getGeocodeQueueMetrics()

    expect(first.failedRetriable).toBe(1)
    expect(second.failedRetriable).toBe(1)
    expect(third.succeeded).toBe(1)
    expect(attemptsBySale['sale-retry']).toBe(3)
    expect(attemptsBySale['sale-retry']).toBeLessThanOrEqual(5)
    expect(metrics.total_jobs_pending).toBe(0)
  })

  it('idle loop guard logs clearly and does not silently drop jobs', async () => {
    process.env.MAX_HIGH_PER_MINUTE = '0'
    process.env.GEOCODE_QUEUE_BATCH_SIZE = '2'
    process.env.GEOCODE_QUEUE_MAX_IDLE_LOOPS_FACTOR = '1'

    const state = createRedisState()
    state.high.push(JSON.stringify({ sale_id: 'sale-stuck-high', priority: 'HIGH' }))
    state.normal.push(JSON.stringify({ sale_id: 'sale-existing-normal', priority: 'NORMAL' }))

    const baseFetch = redisFetchMock(state)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const command = url.split('/').pop()
      const args = JSON.parse(String(init?.body || '[]'))
      // Simulate pathological high queue source that continuously yields work.
      if (command === 'rpop' && String(args[0]) === 'geocode_jobs:high') {
        return {
          ok: true,
          json: async () => ({ result: JSON.stringify({ sale_id: 'sale-stuck-high', priority: 'HIGH' }) }),
        }
      }
      return baseFetch(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    mockGeocodeById.mockResolvedValue({ success: true, terminalFailure: false, attemptCount: 1 })

    const { processGeocodeQueueBatch, getGeocodeQueueMetrics } = await import('@/lib/ingestion/geocodeQueue')
    const result = await processGeocodeQueueBatch()
    const metrics = await getGeocodeQueueMetrics()

    expect(result.processed).toBe(0)
    expect(mockGeocodeById).not.toHaveBeenCalled()
    expect(warnLogger).toHaveBeenCalledWith(
      'geocode queue batch stopped after idle loop guard',
      expect.objectContaining({
        operation: 'idle_loop_guard',
        jobsMayRemainQueued: true,
      })
    )
    expect(metrics.total_jobs_pending).toBeGreaterThan(0)
    expect(metrics.queue_length_normal).toBeGreaterThan(0)
  })
})
