import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Ingestion continuity when the Redis geocode queue is unavailable: queue drain is a
 * no-op, enqueue returns null, and geocodePendingSales (cron backlog) still moves
 * needs_geocode rows toward ready/publish with bounded retries.
 */

const ROW_ID = '88888888-8888-4888-8888-888888888888'

type Row = {
  id: string
  status: string
  normalized_address: string | null
  address_raw: string | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  geocode_attempts: number
  failure_reasons: unknown
  published_sale_id: string | null
  last_geocode_attempt_at: string | null
}

const ctx = vi.hoisted(() => {
  const FIXED_NOW_MS = Date.parse('2026-09-15T16:00:00.000Z')

  const store = { row: null as unknown as Row }
  const rpcCooldown = { minutes: 2 }

  function resetRow() {
    store.row = {
      id: ROW_ID,
      status: 'needs_geocode',
      normalized_address: '200 Redis-Off Ln',
      address_raw: null,
      city: 'Seattle',
      state: 'WA',
      lat: null,
      lng: null,
      geocode_attempts: 0,
      failure_reasons: [],
      published_sale_id: null,
      last_geocode_attempt_at: null,
    }
  }

  function cloneRow(r: Row): Record<string, unknown> {
    return {
      id: r.id,
      status: r.status,
      normalized_address: r.normalized_address,
      address_raw: r.address_raw,
      city: r.city,
      state: r.state,
      lat: r.lat,
      lng: r.lng,
      geocode_attempts: r.geocode_attempts,
      failure_reasons: r.failure_reasons,
      published_sale_id: r.published_sale_id,
    }
  }

  function tryRpcClaim(): {
    id: string
    normalized_address: string | null
    address_raw: string | null
    city: string | null
    state: string | null
    geocode_attempts: number
    failure_reasons: unknown
  } | null {
    const r = store.row
    if (r.status !== 'needs_geocode') return null
    if (r.geocode_attempts >= 3) return null
    const cooldownMs = rpcCooldown.minutes * 60 * 1000
    if (r.last_geocode_attempt_at != null) {
      const lastMs = Date.parse(r.last_geocode_attempt_at)
      const nowMs = Date.now()
      if (!(lastMs < nowMs - cooldownMs)) return null
    }
    r.geocode_attempts += 1
    r.last_geocode_attempt_at = new Date().toISOString()
    return {
      id: r.id,
      normalized_address: r.normalized_address,
      address_raw: r.address_raw,
      city: r.city,
      state: r.state,
      geocode_attempts: r.geocode_attempts,
      failure_reasons: r.failure_reasons,
    }
  }

  type ChainCtx = {
    op: 'select' | 'update' | null
    fields: string
    payload: Record<string, unknown> | null
    eqs: [string, unknown][]
  }

  function createIngstedSalesChain(): unknown {
    const chainCtx: ChainCtx = {
      op: null,
      fields: '',
      payload: null,
      eqs: [],
    }

    function dispatchMaybeSingle(): { data: unknown; error: null } {
      const idEq = chainCtx.eqs.find((e) => e[0] === 'id')
      const statusEq = chainCtx.eqs.find((e) => e[0] === 'status')
      const r = store.row

      if (chainCtx.op === 'select') {
        if (!idEq || idEq[1] !== r.id) return { data: null, error: null }
        return { data: cloneRow(r), error: null }
      }

      if (chainCtx.op === 'update' && chainCtx.payload) {
        const p = chainCtx.payload
        if (!idEq || idEq[1] !== r.id) return { data: null, error: null }

        if ('lat' in p && p.status === 'ready' && typeof p.lat === 'number') {
          if (r.status !== 'needs_geocode' || statusEq?.[1] !== 'needs_geocode') {
            return { data: null, error: null }
          }
          r.lat = p.lat as number
          r.lng = p.lng as number
          r.status = 'ready'
          return { data: { id: r.id }, error: null }
        }

        if ('geocode_attempts' in p && p.last_geocode_attempt_at != null) {
          if (r.status !== 'needs_geocode' || statusEq?.[1] !== 'needs_geocode') {
            return { data: null, error: null }
          }
          r.geocode_attempts = p.geocode_attempts as number
          r.last_geocode_attempt_at = p.last_geocode_attempt_at as string
          return { data: { id: r.id }, error: null }
        }
      }

      return { data: null, error: null }
    }

    function dispatchAwaitable(): { error: null } {
      if (chainCtx.op === 'update' && chainCtx.payload) {
        const p = chainCtx.payload
        const idEq = chainCtx.eqs.find((e) => e[0] === 'id')
        const statusEq = chainCtx.eqs.find((e) => e[0] === 'status')
        const r = store.row
        if (
          p.status === 'ready' &&
          !('lat' in p) &&
          idEq?.[1] === r.id &&
          statusEq?.[1] === 'needs_geocode' &&
          r.status === 'needs_geocode'
        ) {
          r.status = 'ready'
        }
        if (p.status === 'needs_check' && idEq?.[1] === r.id) {
          r.status = 'needs_check'
          r.failure_reasons = p.failure_reasons ?? []
        }
      }
      return { error: null }
    }

    const chain: Record<string, unknown> = {}
    const self = new Proxy(chain, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => {
            Promise.resolve().then(() => resolve(dispatchAwaitable()))
          }
        }
        if (prop === 'select') {
          return (fields: string) => {
            if (chainCtx.op === 'update') {
              /* .update(...).eq...select('id').maybeSingle() — keep op as update */
            } else {
              chainCtx.op = 'select'
              chainCtx.fields = fields
            }
            return self
          }
        }
        if (prop === 'update') {
          return (payload: Record<string, unknown>) => {
            chainCtx.op = 'update'
            chainCtx.payload = payload
            return self
          }
        }
        if (prop === 'eq') {
          return (col: string, val: unknown) => {
            chainCtx.eqs.push([col, val])
            return self
          }
        }
        if (prop === 'maybeSingle') {
          return async () => dispatchMaybeSingle()
        }
        return () => self
      },
    })
    return self
  }

  const geocodeAddress = vi.fn()
  const publishReadyIngestedSaleById = vi.fn()
  const adminRpc = vi.fn()
  const loggerInfo = vi.fn()
  const loggerWarn = vi.fn()
  const loggerError = vi.fn()

  return {
    store,
    rpcCooldown,
    resetRow,
    tryRpcClaim,
    createIngstedSalesChain,
    geocodeAddress,
    publishReadyIngestedSaleById,
    adminRpc,
    loggerInfo,
    loggerWarn,
    loggerError,
    FIXED_NOW_MS,
  }
})

vi.mock('@/lib/ingestion/orchestrationMetrics', () => ({
  recordGeocodeCronOrchestrationRun: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ingestion/geocodePipelineLease', () => ({
  runWithGeocodePipelineLease: async <T,>({ execute }: { execute: () => Promise<T> }) => ({
    ok: true,
    skipped: false,
    result: await execute(),
    lease: { acquired: true, owner: 'redis-fallback-test', staleRecovered: false, cursor: 0 },
  }),
}))

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({
    rpc: ctx.adminRpc,
  })),
  fromBase: vi.fn((_admin: unknown, table: string) => {
    if (table === 'ingested_sales') {
      return ctx.createIngstedSalesChain()
    }
    return {
      update: () => ({
        eq: () => ({ error: null }),
      }),
    }
  }),
}))

vi.mock('@/lib/geocode/geocodeAddress', () => ({
  geocodeAddress: ctx.geocodeAddress,
}))

vi.mock('@/lib/ingestion/publishWorker', () => ({
  publishReadyIngestedSaleById: ctx.publishReadyIngestedSaleById,
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: (...a: unknown[]) => ctx.loggerInfo(...a),
    warn: (...a: unknown[]) => ctx.loggerWarn(...a),
    error: (...a: unknown[]) => ctx.loggerError(...a),
  },
  generateOperationId: vi.fn(() => 'redis-fallback-op'),
}))

describe('Redis-unavailable geocode ingestion fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: ctx.FIXED_NOW_MS })
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.GEOCODE_CONCURRENCY = '1'

    ctx.resetRow()
    ctx.rpcCooldown.minutes = 2
    vi.clearAllMocks()

    ctx.geocodeAddress.mockResolvedValue({ coords: { lat: 47.6, lng: -122.33 }, hit429: false })
    ctx.publishReadyIngestedSaleById.mockResolvedValue({
      ok: true,
      publishedSaleId: 'published-redis-off-1',
    })

    ctx.adminRpc.mockImplementation(async (name: string, params: { p_cooldown_minutes?: number }) => {
      if (name !== 'claim_ingested_sales_for_geocoding') {
        return { data: [], error: null }
      }
      ctx.rpcCooldown.minutes = params?.p_cooldown_minutes ?? 2
      const claimed = ctx.tryRpcClaim()
      return { data: claimed ? [claimed] : [], error: null }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.GEOCODE_CONCURRENCY
  })

  it('enqueue and processGeocodeQueueBatch degrade gracefully when Redis is not configured', async () => {
    const { enqueue, processGeocodeQueueBatch, isGeocodeQueueConfigured } = await import(
      '@/lib/ingestion/geocodeQueue'
    )

    expect(isGeocodeQueueConfigured()).toBe(false)
    expect(await enqueue(ROW_ID)).toBe(null)

    await expect(processGeocodeQueueBatch(50)).resolves.toEqual({
      dequeued: 0,
      completed: 0,
      requeued: 0,
    })
  })

  it('geocodePendingSales still progresses needs_geocode to ready and publish without Redis', async () => {
    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')

    const summary = await geocodePendingSales({ batchSizeOverride: 10, cooldownMinutesOverride: 2 })

    expect(summary.claimed).toBe(1)
    expect(summary.succeeded).toBe(1)
    expect(summary.failedTerminal).toBe(0)
    expect(ctx.store.row.status).toBe('ready')
    expect(ctx.store.row.geocode_attempts).toBeLessThanOrEqual(3)
    expect(ctx.publishReadyIngestedSaleById).toHaveBeenCalledWith(ROW_ID)
    expect(ctx.store.row.status).not.toBe('needs_check')
  })

  it('backlog retry: retriable no-coords then success after cooldown window (no needs_check)', async () => {
    ctx.geocodeAddress.mockImplementation(async () => {
      if (ctx.store.row.geocode_attempts < 2) {
        return {
          coords: null,
          hit429: false,
          noCoordsReason: 'empty_results',
          providerClassification: 'empty_results',
        }
      }
      return {
        coords: { lat: 47.61, lng: -122.34 },
        hit429: false,
        coordinatePrecision: 'exact_address',
      }
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')

    const first = await geocodePendingSales({ batchSizeOverride: 10, cooldownMinutesOverride: 2 })
    expect(first.claimed).toBe(1)
    expect(first.succeeded).toBe(0)
    expect(first.failedRetriable).toBe(1)
    expect(ctx.store.row.status).toBe('needs_geocode')
    expect(ctx.store.row.geocode_attempts).toBe(1)

    vi.setSystemTime(ctx.FIXED_NOW_MS + 121_000)

    const second = await geocodePendingSales({ batchSizeOverride: 10, cooldownMinutesOverride: 2 })
    expect(second.claimed).toBe(1)
    expect(second.succeeded).toBe(1)
    expect(second.failedTerminal).toBe(0)
    expect(ctx.store.row.status).toBe('ready')
    expect(ctx.publishReadyIngestedSaleById).toHaveBeenCalledWith(ROW_ID)
    expect(ctx.store.row.status).not.toBe('needs_check')
  })

  it('GET /api/cron/geocode runs backlog after no-op queue when Redis is off', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {})

    const { GET } = await import('@/app/api/cron/geocode/route')

    const req = new NextRequest('http://localhost/api/cron/geocode', { method: 'GET' })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.queue).toEqual({
      processed: 0,
      completed: 0,
      requeued: 0,
      failed: 0,
    })
    expect(data.backlog.claimed).toBe(1)
    expect(data.backlog.failed).toBe(0)
    expect(ctx.store.row.status).toBe('ready')
    expect(ctx.publishReadyIngestedSaleById).toHaveBeenCalledWith(ROW_ID)
  })
})
