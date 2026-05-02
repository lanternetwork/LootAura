import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  maybeSingleResults: [] as Array<{ data: unknown; error: Error | null }>,
  geocodeAddress: vi.fn(),
  publishReadyIngestedSaleById: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn(() => createQueryBuilder()),
}))

vi.mock('@/lib/geocode/geocodeAddress', () => ({
  geocodeAddress: hoisted.geocodeAddress,
}))

vi.mock('@/lib/ingestion/publishWorker', () => ({
  publishReadyIngestedSaleById: hoisted.publishReadyIngestedSaleById,
}))

function createQueryBuilder() {
  const builder: Record<string, unknown> = {}
  const self = new Proxy(builder, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (value: { error: Error | null }) => void) => {
          resolve({ error: null })
        }
      }
      if (prop === 'maybeSingle') {
        return async () => {
          const next = hoisted.maybeSingleResults.shift() ?? { data: null, error: null }
          return next
        }
      }
      if (prop === 'rpc') {
        return async () => ({ data: [], error: null })
      }
      return () => self
    },
  })
  return self as {
    select: () => unknown
    eq: () => unknown
    update: () => unknown
    maybeSingle: () => Promise<{ data: unknown; error: Error | null }>
  }
}

describe('geocodeIngestedSaleById', () => {
  beforeEach(async () => {
    vi.resetModules()
    hoisted.maybeSingleResults = []
    hoisted.geocodeAddress.mockReset()
    hoisted.publishReadyIngestedSaleById.mockReset()
    hoisted.publishReadyIngestedSaleById.mockResolvedValue({
      ok: true,
      skipped: true,
      reason: 'not_eligible',
    })
  })

  it('skips when row is not needs_geocode', async () => {
    hoisted.maybeSingleResults.push({
      data: {
        id: '00000000-0000-4000-8000-000000000001',
        status: 'ready',
        normalized_address: '1 Main',
        address_raw: null,
        city: 'Louisville',
        state: 'KY',
        lat: 38,
        lng: -85,
        geocode_attempts: 0,
        failure_reasons: [],
        published_sale_id: null,
      },
      error: null,
    })

    const { geocodeIngestedSaleById } = await import('@/lib/ingestion/geocodeWorker')
    const result = await geocodeIngestedSaleById('00000000-0000-4000-8000-000000000001')

    expect(result).toEqual({ outcome: 'skipped', reason: 'not_needs_geocode' })
    expect(hoisted.geocodeAddress).not.toHaveBeenCalled()
  })

  it('when lat/lng already set, marks ready and invokes publish helper', async () => {
    hoisted.maybeSingleResults.push({
      data: {
        id: '00000000-0000-4000-8000-000000000002',
        status: 'needs_geocode',
        normalized_address: '1 Main',
        address_raw: null,
        city: 'Louisville',
        state: 'KY',
        lat: 38.1,
        lng: -85.7,
        geocode_attempts: 0,
        failure_reasons: [],
        published_sale_id: null,
      },
      error: null,
    })

    hoisted.publishReadyIngestedSaleById.mockResolvedValue({
      ok: true,
      publishedSaleId: 'sale-1',
    })

    const { geocodeIngestedSaleById } = await import('@/lib/ingestion/geocodeWorker')
    const result = await geocodeIngestedSaleById('00000000-0000-4000-8000-000000000002')

    expect(result).toEqual({
      outcome: 'success',
      published: true,
      publishedSaleId: 'sale-1',
    })
    expect(hoisted.geocodeAddress).not.toHaveBeenCalled()
    expect(hoisted.publishReadyIngestedSaleById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002')
  })

  it('geocodes, updates to ready, and returns publish outcome', async () => {
    hoisted.maybeSingleResults.push({
      data: {
        id: '00000000-0000-4000-8000-000000000003',
        status: 'needs_geocode',
        normalized_address: '10 Oak',
        address_raw: null,
        city: 'Louisville',
        state: 'KY',
        lat: null,
        lng: null,
        geocode_attempts: 0,
        failure_reasons: [],
        published_sale_id: null,
      },
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { id: '00000000-0000-4000-8000-000000000003' },
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { id: '00000000-0000-4000-8000-000000000003' },
      error: null,
    })

    hoisted.geocodeAddress.mockResolvedValue({ lat: 38.2, lng: -85.8 })
    hoisted.publishReadyIngestedSaleById.mockResolvedValue({
      ok: true,
      publishedSaleId: 'sale-2',
    })

    const { geocodeIngestedSaleById } = await import('@/lib/ingestion/geocodeWorker')
    const result = await geocodeIngestedSaleById('00000000-0000-4000-8000-000000000003')

    expect(result.outcome).toBe('success')
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith({
      address: '10 Oak',
      city: 'Louisville',
      state: 'KY',
    })
    expect(hoisted.publishReadyIngestedSaleById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000003')
  })
})
