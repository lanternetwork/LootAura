import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Overlap between queue-triggered geocode (geocodeIngestedSaleById) and backlog
 * batch geocode (geocodePendingSales → claim RPC + processGeocodeAttempt) on the
 * same ingested_sales row. Stateful fromBase simulates guarded updates and RPC claim.
 */

const ctx = vi.hoisted(() => {
  const ROW_ID = '77777777-7777-4777-8777-777777777777'
  const FIXED_NOW_MS = Date.parse('2026-08-01T14:00:00.000Z')
  const FIXED_NOW_ISO = new Date(FIXED_NOW_MS).toISOString()

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

  const store = {
    row: null as unknown as Row,
  }

  const rpcCooldown = { minutes: 2 }
  let publishFirstDone = false

  function resetRow() {
    store.row = {
      id: ROW_ID,
      status: 'needs_geocode',
      normalized_address: '100 Concurrent Ave',
      address_raw: null,
      city: 'Boulder',
      state: 'CO',
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
      if (!(lastMs < FIXED_NOW_MS - cooldownMs)) return null
    }
    r.geocode_attempts += 1
    r.last_geocode_attempt_at = FIXED_NOW_ISO
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
    selectAfterUpdate: string | null
  }

  function createIngstedSalesChain(): unknown {
    const chainCtx: ChainCtx = {
      op: null,
      fields: '',
      payload: null,
      eqs: [],
      selectAfterUpdate: null,
    }

    function dispatchMaybeSingle(): { data: unknown; error: null } {
      const idEq = chainCtx.eqs.find((e) => e[0] === 'id')
      const statusEq = chainCtx.eqs.find((e) => e[0] === 'status')
      const r = store.row

      if (chainCtx.op === 'select') {
        if (!idEq || idEq[1] !== r.id) {
          return { data: null, error: null }
        }
        return { data: cloneRow(r), error: null }
      }

      if (chainCtx.op === 'update' && chainCtx.payload) {
        const p = chainCtx.payload
        if (!idEq || idEq[1] !== r.id) {
          return { data: null, error: null }
        }

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
              chainCtx.selectAfterUpdate = fields
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
    ROW_ID,
    FIXED_NOW_MS,
    FIXED_NOW_ISO,
    store,
    rpcCooldown,
    resetRow,
    tryRpcClaim,
    createIngstedSalesChain,
    get publishFirstDone() {
      return publishFirstDone
    },
    setPublishFirstDone(v: boolean) {
      publishFirstDone = v
    },
    geocodeAddress,
    publishReadyIngestedSaleById,
    adminRpc,
    loggerInfo,
    loggerWarn,
    loggerError,
  }
})

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({
    rpc: ctx.adminRpc,
  })),
  fromBase: vi.fn((_admin: unknown, table: string) => {
    if (table === 'ingested_sales') {
      return ctx.createIngstedSalesChain()
    }
    if (table === 'address_geocode_cache') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
        upsert: async () => ({ error: null }),
      }
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
}))

describe('geocode queue vs backlog overlap', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers({ now: ctx.FIXED_NOW_MS })
    process.env.GEOCODE_CONCURRENCY = '1'

    ctx.resetRow()
    ctx.rpcCooldown.minutes = 2
    ctx.setPublishFirstDone(false)

    vi.clearAllMocks()
    ctx.geocodeAddress.mockResolvedValue({ coords: { lat: 40.01, lng: -105.27 }, hit429: false })
    ctx.publishReadyIngestedSaleById.mockImplementation(async () => {
      if (ctx.publishFirstDone) {
        return { ok: true, skipped: true, reason: 'not_eligible' as const }
      }
      ctx.setPublishFirstDone(true)
      return { ok: true, publishedSaleId: 'geo-overlap-sale-1' }
    })

    ctx.adminRpc.mockImplementation(async (name: string, params: { p_cooldown_minutes?: number }) => {
      await Promise.resolve()
      if (name !== 'claim_ingested_sales_for_geocoding') {
        return { data: [], error: null }
      }
      ctx.rpcCooldown.minutes = params?.p_cooldown_minutes ?? 2
      const claimed = ctx.tryRpcClaim()
      return { data: claimed ? [claimed] : [], error: null }
    })

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.useRealTimers()
    delete process.env.GEOCODE_CONCURRENCY
  })

  it('concurrent queue + backlog on same row: bounded attempts, valid terminal status, idempotent publish', async () => {
    const { geocodeIngestedSaleById, geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')

    const [byIdResult, batchSummary] = await Promise.all([
      geocodeIngestedSaleById(ctx.ROW_ID),
      geocodePendingSales({ batchSizeOverride: 10, cooldownMinutesOverride: 2 }),
    ])

    expect(batchSummary.claimed).toBeLessThanOrEqual(1)
    expect(batchSummary.failedTerminal).toBe(0)

    expect(byIdResult.outcome).toBe('success')
    expect(ctx.store.row.status).toBe('ready')
    expect(ctx.store.row.geocode_attempts).toBeLessThanOrEqual(3)
    expect(ctx.store.row.lat).not.toBeNull()
    expect(ctx.store.row.lng).not.toBeNull()

    expect(ctx.publishReadyIngestedSaleById.mock.calls.length).toBeLessThanOrEqual(2)
    expect(ctx.publishFirstDone).toBe(true)
    for (const c of ctx.publishReadyIngestedSaleById.mock.calls) {
      expect(c[0]).toBe(ctx.ROW_ID)
    }

    expect(ctx.geocodeAddress.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('after queue path succeeds, backlog claim sees no needs_geocode rows (graceful empty batch)', async () => {
    const { geocodeIngestedSaleById, geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')

    const first = await geocodeIngestedSaleById(ctx.ROW_ID)
    expect(first.outcome).toBe('success')
    expect(ctx.store.row.status).toBe('ready')

    ctx.adminRpc.mockClear()
    ctx.adminRpc.mockImplementation(async (name: string, params: { p_cooldown_minutes?: number }) => {
      if (name !== 'claim_ingested_sales_for_geocoding') {
        return { data: [], error: null }
      }
      ctx.rpcCooldown.minutes = params?.p_cooldown_minutes ?? 2
      const claimed = ctx.tryRpcClaim()
      return { data: claimed ? [claimed] : [], error: null }
    })

    const batch = await geocodePendingSales({ batchSizeOverride: 10, cooldownMinutesOverride: 0 })
    expect(batch.claimed).toBe(0)
    expect(ctx.store.row.status).toBe('ready')
    expect(ctx.loggerWarn).toHaveBeenCalledWith(
      'Geocode worker claimed zero rows',
      expect.objectContaining({ operation: 'claim_rows_empty' })
    )

    const secondById = await geocodeIngestedSaleById(ctx.ROW_ID)
    expect(secondById).toEqual({ outcome: 'skipped', reason: 'not_needs_geocode' })
  })
})
