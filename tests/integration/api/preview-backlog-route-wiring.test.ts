import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { PreviewBacklogDrainResult } from '@/lib/ingestion/previewBacklogDrain'

const hoisted = vi.hoisted(() => ({
  maybeRunPreviewBacklogDrain: vi.fn(),
}))

vi.mock('@/lib/ingestion/previewBacklogDrain', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ingestion/previewBacklogDrain')>()
  return {
    ...mod,
    maybeRunPreviewBacklogDrain: hoisted.maybeRunPreviewBacklogDrain,
  }
})

function mockDrainResult(overrides: Partial<PreviewBacklogDrainResult> = {}): PreviewBacklogDrainResult {
  return {
    status: 'completed',
    reason: 'completed',
    claimed: 1,
    processed: 1,
    failed: 0,
    publishTriggered: 1,
    publishOk: 1,
    publishFailed: 0,
    geocodeInvoked: true,
    geocodeResolvedSuccessfully: true,
    cooldownTimestampMutated: true,
    msSinceLastRun: null,
    durationMs: 10,
    firstClaimedRowIds: ['row-1'],
    ...overrides,
  }
}

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: {},
}))

describe('preview backlog drain route wiring', () => {
  beforeEach(() => {
    const env = process.env as Record<string, string | undefined>
    vi.resetModules()
    vi.clearAllMocks()
    env.NODE_ENV = 'production'
    env.VERCEL_ENV = 'preview'
    hoisted.maybeRunPreviewBacklogDrain.mockResolvedValue(mockDrainResult())
  })

  it('sales route drains before cache return and sets preview self-verify headers', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue({}),
    }))
    vi.doMock('@/lib/cache/salesApiCache', () => ({
      buildSalesCacheKey: vi.fn().mockReturnValue('cache-key'),
      getSalesApiCache: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      setSalesApiCache: vi.fn(),
    }))
    vi.doMock('@/lib/http/cache', () => ({
      addCacheHeaders: (response: NextResponse) => response,
    }))

    const route = await import('@/app/api/sales/route')
    const request = new NextRequest('http://localhost:3000/api/sales?lat=41.1&lng=-87.1')
    const response = await route.GET(request)

    expect(hoisted.maybeRunPreviewBacklogDrain).toHaveBeenCalledWith('api/sales')
    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBe('completed')
    expect(response.headers.get('x-lootaura-preview-backlog-reason')).toBe('completed')
    expect(response.headers.get('x-lootaura-preview-backlog-claimed')).toBe('1')
    expect(response.headers.get('x-lootaura-preview-backlog-processed')).toBe('1')
    expect(response.headers.get('x-lootaura-preview-backlog-geocode-invoked')).toBe('true')
    expect(response.headers.get('x-lootaura-preview-backlog-geocode-resolved')).toBe('true')
    expect(response.headers.get('x-lootaura-preview-backlog-first-claimed-ids')).toBe('row-1')
  })

  it('markers route still invokes preview drain and sets status header', async () => {
    const route = await import('@/app/api/sales/markers/route')
    const request = new NextRequest('http://localhost:3000/api/sales/markers')
    const response = await route.GET(request)

    expect(hoisted.maybeRunPreviewBacklogDrain).toHaveBeenCalledWith('api/sales/markers')
    expect(response.status).toBe(400)
    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBe('completed')
  })

  it('production never adds preview backlog headers', async () => {
    const env = process.env as Record<string, string | undefined>
    env.VERCEL_ENV = 'production'

    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue({}),
    }))
    vi.doMock('@/lib/cache/salesApiCache', () => ({
      buildSalesCacheKey: vi.fn().mockReturnValue('cache-key'),
      getSalesApiCache: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      setSalesApiCache: vi.fn(),
    }))
    vi.doMock('@/lib/http/cache', () => ({
      addCacheHeaders: (response: NextResponse) => response,
    }))

    const { PREVIEW_BACKLOG_DRAIN_HEADER_NAMES } = await import('@/lib/ingestion/previewBacklogDrain')
    const route = await import('@/app/api/sales/route')
    const request = new NextRequest('http://localhost:3000/api/sales?lat=41.1&lng=-87.1')
    const response = await route.GET(request)

    for (const name of PREVIEW_BACKLOG_DRAIN_HEADER_NAMES) {
      expect(response.headers.get(name)).toBeNull()
    }
  })

  it('cooldown_skip exposes geocode-invoked false and ms-since-last-run', async () => {
    hoisted.maybeRunPreviewBacklogDrain.mockResolvedValue(
      mockDrainResult({
        status: 'cooldown_skip',
        reason: 'cooldown_active',
        claimed: 0,
        processed: 0,
        publishTriggered: 0,
        publishOk: 0,
        publishFailed: 0,
        geocodeInvoked: false,
        geocodeResolvedSuccessfully: false,
        cooldownTimestampMutated: false,
        msSinceLastRun: 42,
        durationMs: 0,
        firstClaimedRowIds: [],
      })
    )
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue({}),
    }))
    vi.doMock('@/lib/cache/salesApiCache', () => ({
      buildSalesCacheKey: vi.fn().mockReturnValue('cache-key'),
      getSalesApiCache: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      setSalesApiCache: vi.fn(),
    }))
    vi.doMock('@/lib/http/cache', () => ({
      addCacheHeaders: (response: NextResponse) => response,
    }))

    const route = await import('@/app/api/sales/route')
    const response = await route.GET(new NextRequest('http://localhost:3000/api/sales?lat=41.1&lng=-87.1'))

    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBe('cooldown_skip')
    expect(response.headers.get('x-lootaura-preview-backlog-geocode-invoked')).toBe('false')
    expect(response.headers.get('x-lootaura-preview-backlog-ms-since-last-run')).toBe('42')
  })

  it('lease_unavailable exposes reason header', async () => {
    hoisted.maybeRunPreviewBacklogDrain.mockResolvedValue(
      mockDrainResult({
        status: 'lease_unavailable',
        reason: 'missing_redis_env',
        geocodeInvoked: false,
        geocodeResolvedSuccessfully: false,
        cooldownTimestampMutated: false,
        durationMs: 5,
      })
    )
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue({}),
    }))
    vi.doMock('@/lib/cache/salesApiCache', () => ({
      buildSalesCacheKey: vi.fn().mockReturnValue('cache-key'),
      getSalesApiCache: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      setSalesApiCache: vi.fn(),
    }))
    vi.doMock('@/lib/http/cache', () => ({
      addCacheHeaders: (response: NextResponse) => response,
    }))

    const route = await import('@/app/api/sales/route')
    const response = await route.GET(new NextRequest('http://localhost:3000/api/sales?lat=41.1&lng=-87.1'))

    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBe('lease_unavailable')
    expect(response.headers.get('x-lootaura-preview-backlog-reason')).toBe('missing_redis_env')
  })

  it('error exposes geocode-resolved false and cooldown-mutated false', async () => {
    hoisted.maybeRunPreviewBacklogDrain.mockResolvedValue(
      mockDrainResult({
        status: 'error',
        reason: 'geocode_pending_failed',
        geocodeInvoked: true,
        geocodeResolvedSuccessfully: false,
        cooldownTimestampMutated: false,
        durationMs: 99,
      })
    )
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue({}),
    }))
    vi.doMock('@/lib/cache/salesApiCache', () => ({
      buildSalesCacheKey: vi.fn().mockReturnValue('cache-key'),
      getSalesApiCache: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      setSalesApiCache: vi.fn(),
    }))
    vi.doMock('@/lib/http/cache', () => ({
      addCacheHeaders: (response: NextResponse) => response,
    }))

    const route = await import('@/app/api/sales/route')
    const response = await route.GET(new NextRequest('http://localhost:3000/api/sales?lat=41.1&lng=-87.1'))

    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBe('error')
    expect(response.headers.get('x-lootaura-preview-backlog-geocode-resolved')).toBe('false')
    expect(response.headers.get('x-lootaura-preview-backlog-cooldown-mutated')).toBe('false')
  })

  it('upload route invokes preview drain after successful persist and sets header', async () => {
    vi.doMock('@/lib/auth/adminGate', () => ({
      assertAdminOrThrow: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('@/lib/api/csrfCheck', () => ({
      checkCsrfIfRequired: vi.fn().mockResolvedValue(null),
    }))
    vi.doMock('@/lib/ingestion/schemas', () => ({
      ManualUploadSchema: {
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: [{
            sourcePlatform: 'manual_upload',
            sourceUrl: 'https://example.com/sale-1',
            externalId: 'ext-1',
            title: 'Sale 1',
            description: 'desc',
            addressRaw: '123 Main St',
            cityHint: 'Chicago',
            stateHint: 'IL',
            rawPayload: {},
            imageSourceUrl: null,
          }],
        }),
      },
    }))
    vi.doMock('@/lib/ingestion/processSale', () => ({
      processIngestedSale: vi.fn().mockResolvedValue({
        failureReasons: [],
        status: 'needs_geocode',
        normalizedAddress: '123 Main St, Chicago, IL',
        city: 'Chicago',
        state: 'IL',
        lat: null,
        lng: null,
        dateStart: null,
        dateEnd: null,
        timeStart: null,
        timeEnd: null,
        dateSource: null,
        timeSource: null,
        parseConfidence: 0.9,
      }),
    }))
    vi.doMock('@/lib/ingestion/dedupe', () => ({
      findIngestedSaleMatch: vi.fn().mockResolvedValue(null),
    }))
    vi.doMock('@/lib/ingestion/uploadDescriptionSanitizer', () => ({
      sanitizeUploadDescription: vi.fn().mockReturnValue('clean desc'),
    }))
    vi.doMock('@/lib/ingestion/ensureCityConfigFromListingSource', () => ({
      ensureIngestionCityConfigFromListingSource: vi.fn().mockResolvedValue({ ok: false }),
    }))
    vi.doMock('@/lib/ingestion/geocodeQueue', () => ({
      enqueue: vi.fn(),
      isGeocodeQueueConfigured: vi.fn().mockReturnValue(false),
    }))
    vi.doMock('@/lib/ingestion/geocodeWorker', () => ({
      geocodeIngestedSaleById: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('@/lib/supabase/clients', () => {
      const fromBase = vi.fn((_: unknown, table: string) => {
        if (table === 'ingestion_runs') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'run-1' }, error: null }),
              }),
            }),
            update: () => ({
              eq: async () => ({ data: null, error: null }),
            }),
          }
        }
        if (table === 'ingestion_city_configs') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          }
        }
        if (table === 'ingested_sales') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'ingested-1' }, error: null }),
              }),
            }),
          }
        }
        return {}
      })
      return {
        getAdminDb: vi.fn().mockReturnValue({}),
        fromBase,
      }
    })
    vi.doMock('@/lib/log', () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      generateOperationId: vi.fn().mockReturnValue('op-1'),
    }))

    const route = await import('@/app/api/admin/ingested-sales/upload/route')
    const request = new NextRequest('http://localhost:3000/api/admin/ingested-sales/upload', {
      method: 'POST',
      body: JSON.stringify({ records: [{}] }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await route.POST(request)

    expect(response.status).toBe(200)
    expect(hoisted.maybeRunPreviewBacklogDrain).toHaveBeenCalledWith('api/admin/ingested-sales/upload')
    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBe('completed')
  })
})

