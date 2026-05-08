import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const hoisted = vi.hoisted(() => ({
  maybeRunPreviewBacklogDrain: vi.fn(),
}))

vi.mock('@/lib/ingestion/previewBacklogDrain', () => ({
  maybeRunPreviewBacklogDrain: hoisted.maybeRunPreviewBacklogDrain,
  PREVIEW_BACKLOG_DRAIN_HEADER: 'x-lootaura-preview-backlog-drain',
}))

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
    hoisted.maybeRunPreviewBacklogDrain.mockResolvedValue({
      status: 'completed',
      claimed: 1,
      processed: 1,
      failed: 0,
      publishTriggered: 1,
      durationMs: 10,
      firstClaimedRowIds: ['row-1'],
    })
  })

  it('sales route drains before cache return and sets preview header', async () => {
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
  })

  it('markers route still invokes preview drain and sets status header', async () => {
    const route = await import('@/app/api/sales/markers/route')
    const request = new NextRequest('http://localhost:3000/api/sales/markers')
    const response = await route.GET(request)

    expect(hoisted.maybeRunPreviewBacklogDrain).toHaveBeenCalledWith('api/sales/markers')
    expect(response.status).toBe(400)
    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBe('completed')
  })

  it('production never adds preview drain header', async () => {
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

    const route = await import('@/app/api/sales/route')
    const request = new NextRequest('http://localhost:3000/api/sales?lat=41.1&lng=-87.1')
    const response = await route.GET(request)

    expect(response.headers.get('x-lootaura-preview-backlog-drain')).toBeNull()
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

