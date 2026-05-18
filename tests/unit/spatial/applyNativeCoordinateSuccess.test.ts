import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  upsertCache: vi.fn(),
  promote: vi.fn(),
  fromUpdate: vi.fn(),
}))

vi.mock('@/lib/ingestion/spatial/addressGeocodeCache', () => ({
  upsertAddressGeocodeCache: hoisted.upsertCache,
}))

vi.mock('@/lib/ingestion/spatial/promoteIngestedSaleCoordinates', () => ({
  promoteIngestedSaleCoordinates: hoisted.promote,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn(() => ({
    update: () => ({
      eq: hoisted.fromUpdate,
    }),
  })),
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (event: string, payload: Record<string, unknown>) => ({ event, payload }),
  emitObservabilityRecord: vi.fn(),
}))

describe('applyNativeCoordinateSuccess', () => {
  beforeEach(() => {
    hoisted.upsertCache.mockReset()
    hoisted.promote.mockReset()
    hoisted.fromUpdate.mockReset()
    hoisted.fromUpdate.mockResolvedValue({ error: null })
    hoisted.promote.mockResolvedValue({
      kind: 'geocoded',
      publish: { ok: true, publishedSaleId: 'sale-1' },
    })
  })

  it('upserts address_geocode_cache before promote and publish', async () => {
    const { applyNativeCoordinateSuccess } = await import('@/lib/ingestion/spatial/applyNativeCoordinateSuccess')
    const result = await applyNativeCoordinateSuccess({
      rowId: 'row-1',
      priorStatus: 'needs_geocode',
      spatial: {
        lat: 41.1,
        lng: -87.2,
        geocode_confidence: 'high',
        coordinate_precision: 'provider_native',
        geocode_method: 'ystm_provider_native',
        resolutionSource: 'ystm_provider_native',
      },
      addressRaw: '123 Main St',
      normalizedAddress: null,
      city: 'Chicago',
      state: 'IL',
    })

    expect(hoisted.upsertCache).toHaveBeenCalledWith(
      expect.objectContaining({
        geocode_method: 'ystm_provider_native',
        coordinate_precision: 'provider_native',
      })
    )
    expect(hoisted.promote).toHaveBeenCalled()
    expect(result).toEqual({ kind: 'promoted', published: true })
  })
})
