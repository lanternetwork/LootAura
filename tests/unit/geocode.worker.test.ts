import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  maybeSingleResults: [] as Array<{ data: unknown; error: Error | null }>,
  geocodeAddress: vi.fn(),
  publishReadyIngestedSaleById: vi.fn(),
  adminRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({
    rpc: hoisted.adminRpc,
  })),
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
    hoisted.adminRpc.mockReset()
    hoisted.adminRpc.mockResolvedValue({ data: [], error: null })
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

    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.2, lng: -85.8 }, hit429: false })
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

  it('by-id uses address_raw when normalized_address is empty', async () => {
    hoisted.maybeSingleResults.push({
      data: {
        id: '00000000-0000-4000-8000-000000000004',
        status: 'needs_geocode',
        normalized_address: null,
        address_raw: '55 Raw St',
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
      data: { id: '00000000-0000-4000-8000-000000000004' },
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { id: '00000000-0000-4000-8000-000000000004' },
      error: null,
    })

    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.3, lng: -85.9 }, hit429: false })
    hoisted.publishReadyIngestedSaleById.mockResolvedValue({
      ok: true,
      publishedSaleId: 'sale-raw',
    })

    const { geocodeIngestedSaleById } = await import('@/lib/ingestion/geocodeWorker')
    const result = await geocodeIngestedSaleById('00000000-0000-4000-8000-000000000004')

    expect(result.outcome).toBe('success')
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith({
      address: '55 Raw St',
      city: 'Louisville',
      state: 'KY',
    })
  })
})

const claimedRowBase = {
  id: '00000000-0000-4000-8000-0000000000aa',
  city: 'Louisville',
  state: 'KY',
  failure_reasons: [] as unknown[],
}

describe('geocodePendingSales (batch / RPC path)', () => {
  beforeEach(async () => {
    vi.resetModules()
    hoisted.maybeSingleResults = []
    hoisted.geocodeAddress.mockReset()
    hoisted.publishReadyIngestedSaleById.mockReset()
    hoisted.adminRpc.mockReset()
    hoisted.adminRpc.mockResolvedValue({ data: [], error: null })
    hoisted.publishReadyIngestedSaleById.mockResolvedValue({
      ok: true,
      publishedSaleId: 'sale-batch',
    })
  })

  it('batch geocode uses normalized_address when present', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b1',
          normalized_address: '300 Batch Norm',
          address_raw: 'ignored raw',
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { id: '00000000-0000-4000-8000-0000000000b1' },
      error: null,
    })
    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.4, lng: -85.1 }, hit429: false })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.claimed).toBe(1)
    expect(summary.succeeded).toBe(1)
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith({
      address: '300 Batch Norm',
      city: 'Louisville',
      state: 'KY',
    })
    expect(hoisted.publishReadyIngestedSaleById).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000b1')
  })

  it('batch geocode uses address_raw when normalized_address is empty', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b2',
          normalized_address: null,
          address_raw: '400 Only Raw Rd',
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { id: '00000000-0000-4000-8000-0000000000b2' },
      error: null,
    })
    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.5, lng: -85.2 }, hit429: false })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.claimed).toBe(1)
    expect(summary.succeeded).toBe(1)
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith({
      address: '400 Only Raw Rd',
      city: 'Louisville',
      state: 'KY',
    })
  })

  it('batch terminal: third failed attempt with no street line moves to needs_check path', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b3',
          normalized_address: null,
          address_raw: null,
          geocode_attempts: 3,
        },
      ],
      error: null,
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.claimed).toBe(1)
    expect(summary.failedTerminal).toBe(1)
    expect(hoisted.geocodeAddress).not.toHaveBeenCalled()
  })

  it('batch processes multiple claimed rows under concurrent pool', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000c1',
          normalized_address: '500 First',
          address_raw: null,
          geocode_attempts: 1,
        },
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000c2',
          normalized_address: '600 Second',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push(
      { data: { id: '00000000-0000-4000-8000-0000000000c1' }, error: null },
      { data: { id: '00000000-0000-4000-8000-0000000000c2' }, error: null }
    )
    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.6, lng: -85.3 }, hit429: false })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary).toEqual({
      claimed: 2,
      succeeded: 2,
      failedRetriable: 0,
      failedTerminal: 0,
      rate429Count: 0,
    })
    expect(hoisted.geocodeAddress).toHaveBeenCalledTimes(2)
    expect(hoisted.publishReadyIngestedSaleById).toHaveBeenCalledTimes(2)
  })

  it('batch isolates unexpected publish errors as retriable row failures', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000d1',
          normalized_address: '700 Boom',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { id: '00000000-0000-4000-8000-0000000000d1' },
      error: null,
    })
    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.7, lng: -85.4 }, hit429: false })
    hoisted.publishReadyIngestedSaleById.mockRejectedValue(new Error('publish exploded'))

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.claimed).toBe(1)
    expect(summary.succeeded).toBe(0)
    expect(summary.failedRetriable).toBe(1)
    expect(summary.failedTerminal).toBe(0)
  })
})
