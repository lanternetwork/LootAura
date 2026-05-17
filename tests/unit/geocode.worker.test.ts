import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GeocodeAddressOutcome } from '@/lib/geocode/geocodeAddress'
import {
  buildIngestedGeocodeFailureDetailsV1,
  mergeFailureDetailsWithGeocodeAttempt,
  removeGeocodeSubDocumentFromFailureDetails,
} from '@/lib/ingestion/geocodeWorker'

const hoisted = vi.hoisted(() => ({
  maybeSingleResults: [] as Array<{ data: unknown; error: Error | null }>,
  updatePayloads: [] as unknown[],
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
      if (prop === 'update') {
        return (payload: unknown) => {
          hoisted.updatePayloads.push(payload)
          return self
        }
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
    hoisted.updatePayloads = []
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

  it('skips when address is not address_available (D1 gate)', async () => {
    hoisted.maybeSingleResults.push({
      data: {
        id: '00000000-0000-4000-8000-000000000099',
        status: 'needs_geocode',
        address_status: 'address_gated',
        normalized_address: '1 Main',
        address_raw: 'See source',
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

    const { geocodeIngestedSaleById } = await import('@/lib/ingestion/geocodeWorker')
    const result = await geocodeIngestedSaleById('00000000-0000-4000-8000-000000000099')

    expect(result).toEqual({ outcome: 'skipped', reason: 'not_needs_geocode' })
    expect(hoisted.geocodeAddress).not.toHaveBeenCalled()
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
      data: { failure_details: { geocode: { providerClassification: 'empty_results', attemptCount: 1 } } },
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
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith(
      {
        address: '10 Oak',
        city: 'Louisville',
        state: 'KY',
      },
      { mode: 'primary', classificationMode: 'strict' }
    )
    expect(hoisted.publishReadyIngestedSaleById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000003')
    const readyUpdate = hoisted.updatePayloads.find(
      (u) => u && typeof u === 'object' && 'lat' in (u as Record<string, unknown>)
    ) as Record<string, unknown> | undefined
    expect(readyUpdate?.failure_details).toBeNull()
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
      data: { failure_details: null },
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
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith(
      {
        address: '55 Raw St',
        city: 'Louisville',
        state: 'KY',
      },
      { mode: 'primary', classificationMode: 'strict' }
    )
    const readyUpdate = hoisted.updatePayloads.find(
      (u) => u && typeof u === 'object' && 'lat' in (u as Record<string, unknown>)
    ) as Record<string, unknown> | undefined
    expect(readyUpdate?.failure_details).toBeNull()
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
    hoisted.updatePayloads = []
    hoisted.geocodeAddress.mockReset()
    hoisted.publishReadyIngestedSaleById.mockReset()
    hoisted.adminRpc.mockReset()
    hoisted.adminRpc.mockResolvedValue({ data: [], error: null })
    hoisted.publishReadyIngestedSaleById.mockResolvedValue({
      ok: true,
      publishedSaleId: 'sale-batch',
    })
  })

  it('batch geocode prefers address_raw when both raw and normalized exist', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b0',
          normalized_address: '300 norm only',
          address_raw: '300 Visible Raw Rd',
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push(
      { data: { failure_details: null }, error: null },
      { data: { id: '00000000-0000-4000-8000-0000000000b0' }, error: null }
    )
    hoisted.geocodeAddress.mockResolvedValue({
      coords: { lat: 38.35, lng: -85.05 },
      hit429: false,
      coordinatePrecision: 'exact_address',
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.succeeded).toBe(1)
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith(
      {
        address: '300 Visible Raw Rd',
        city: 'Louisville',
        state: 'KY',
      },
      { mode: 'primary', classificationMode: 'strict' }
    )
  })

  it('batch geocode uses normalized_address when address_raw is null', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b1',
          normalized_address: '300 Batch Norm',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { failure_details: null },
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
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith(
      {
        address: '300 Batch Norm',
        city: 'Louisville',
        state: 'KY',
      },
      { mode: 'primary', classificationMode: 'strict' }
    )
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
      data: { failure_details: null },
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
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith(
      {
        address: '400 Only Raw Rd',
        city: 'Louisville',
        state: 'KY',
      },
      { mode: 'primary', classificationMode: 'strict' }
    )
  })

  it('tracks repeated empty-result retries in batch summary', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b4',
          normalized_address: '410 Retry Ln',
          address_raw: null,
          geocode_attempts: 2,
        },
      ],
      error: null,
    })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: false,
      noCoordsReason: 'empty_results',
      providerClassification: 'empty_results',
      queryFingerprint: 'abc123',
      geocodeCityRaw: 'Louisville',
      geocodeCityNormalized: 'Louisville',
    })
    hoisted.maybeSingleResults.push({
      data: { failure_details: null },
      error: null,
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.claimed).toBe(1)
    expect(summary.failedRetriable).toBe(1)
    expect(summary.repeatedEmptyResultRetries).toBe(1)
    expect(summary.providerNoCoordsSummary).toMatchObject({ empty_results: 1 })
    expect(summary.repeatedEmptyResultQueryFingerprints).toMatchObject({ abc123: 1 })
    const diagUpdate = hoisted.updatePayloads.find(
      (u) =>
        u &&
        typeof u === 'object' &&
        (u as Record<string, unknown>).failure_details != null &&
        typeof (u as Record<string, unknown>).failure_details === 'object' &&
        'geocode' in ((u as Record<string, unknown>).failure_details as object)
    ) as Record<string, unknown> | undefined
    const geocode = (diagUpdate?.failure_details as { geocode?: Record<string, unknown> })?.geocode
    expect(geocode?.providerClassification).toBe('empty_results')
    expect(geocode?.queryFingerprint).toBe('abc123')
    expect(geocode?.attemptCount).toBe(2)
    expect(geocode?.schema_version).toBe(3)
    expect(Array.isArray((geocode as { attempts?: unknown }).attempts)).toBe(true)
  })

  it('after primary empty_results, retries with unit stripped and records unit_stripped in v2 attempts', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000u1',
          city: 'Mokena',
          state: 'IL',
          normalized_address: null,
          address_raw: '11020 Front St Unit A, Mokena, IL',
          source_url:
            'https://yardsaletreasuremap.com/US/Illinois/Mokena/11020-Front-St/1/listing.html',
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({ data: { failure_details: null }, error: null })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: false,
      noCoordsReason: 'empty_results',
      providerClassification: 'empty_results',
      queryFingerprint: 'fp-empty',
      geocodeCityRaw: 'Mokena',
      geocodeCityNormalized: 'Mokena',
      attemptLog: {
        mode: 'primary',
        queryStrategy: 'minimal_locality',
        queryFingerprint: 'fp-empty',
      },
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    expect(hoisted.geocodeAddress).toHaveBeenCalledTimes(2)
    expect(hoisted.geocodeAddress.mock.calls[0]?.[0].address).toContain('Unit A')
    expect(hoisted.geocodeAddress.mock.calls[1]?.[0].address).toBe('11020 Front St, Mokena, IL')

    const diagUpdate = hoisted.updatePayloads.find(
      (u) =>
        u &&
        typeof u === 'object' &&
        (u as Record<string, unknown>).failure_details != null &&
        typeof (u as Record<string, unknown>).failure_details === 'object' &&
        'geocode' in ((u as Record<string, unknown>).failure_details as object)
    ) as Record<string, unknown> | undefined
    const geocode = (diagUpdate?.failure_details as { geocode?: { attempts?: unknown[] } })?.geocode
    expect(geocode?.attempts?.[0]).toMatchObject({ strategy: 'primary', resultType: 'empty_results' })
    expect(geocode?.attempts?.[1]).toMatchObject({
      strategy: 'unit_stripped',
      resultType: 'empty_results',
    })
    expect(geocode?.schema_version).toBe(3)
    expect(geocode?.providerCalls).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(geocode?.attempts)).not.toContain('11020 Front St')
    expect(JSON.stringify(geocode?.attempts)).not.toContain('Unit A')
  })

  it('does not unit-strip after primary success', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000u2',
          normalized_address: '9 Oak Unit Z',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push(
      { data: { failure_details: null }, error: null },
      { data: { id: '00000000-0000-4000-8000-0000000000u2' }, error: null }
    )
    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 1, lng: 2 }, hit429: false })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    expect(hoisted.geocodeAddress).toHaveBeenCalledTimes(1)
  })

  it('does not unit-strip after primary 429', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000u3',
          normalized_address: '9 Oak Unit Z',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({ data: { failure_details: null }, error: null })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: true,
      noCoordsReason: 'rate_limited',
      providerClassification: 'rate_limited',
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    expect(hoisted.geocodeAddress).toHaveBeenCalledTimes(1)
  })

  it('does not unit-strip after primary http_not_ok', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000u4',
          normalized_address: '9 Oak Unit Z',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({ data: { failure_details: null }, error: null })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: false,
      noCoordsReason: 'http_not_ok',
      providerClassification: 'http_not_ok',
      httpStatus: 500,
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    expect(hoisted.geocodeAddress).toHaveBeenCalledTimes(1)
  })

  it('does not unit-strip after primary fetch_exception', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000u5',
          normalized_address: '9 Oak Unit Z',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({ data: { failure_details: null }, error: null })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: false,
      noCoordsReason: 'fetch_exception',
      providerClassification: 'fetch_exception',
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    expect(hoisted.geocodeAddress).toHaveBeenCalledTimes(1)
  })

  it('does not unit-strip after primary low_confidence', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000u6',
          normalized_address: '9 Oak Unit Z',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({ data: { failure_details: null }, error: null })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: false,
      noCoordsReason: 'low_confidence',
      providerClassification: 'low_confidence',
      lowConfidenceReasons: ['broad_match'],
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    expect(hoisted.geocodeAddress).toHaveBeenCalledTimes(1)
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
    hoisted.maybeSingleResults.push({
      data: { failure_details: null },
      error: null,
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.claimed).toBe(1)
    expect(summary.failedTerminal).toBe(1)
    expect(hoisted.geocodeAddress).not.toHaveBeenCalled()
    const persistDiag = hoisted.updatePayloads.find(
      (u) =>
        u &&
        typeof u === 'object' &&
        (u as Record<string, unknown>).failure_details != null &&
        typeof (u as Record<string, unknown>).failure_details === 'object' &&
        'geocode' in ((u as Record<string, unknown>).failure_details as object)
    ) as Record<string, unknown> | undefined
    const geocode = (persistDiag?.failure_details as { geocode?: Record<string, unknown> })?.geocode
    expect(geocode?.providerClassification).toBe('empty_results')
    expect(geocode?.noCoordsReason).toBe('empty_input')
    expect(geocode?.attemptCount).toBe(3)
    const terminalUpdate = hoisted.updatePayloads.find(
      (u) => u && typeof u === 'object' && (u as Record<string, unknown>).status === 'needs_check'
    ) as Record<string, unknown> | undefined
    expect(terminalUpdate).toBeDefined()
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
      { data: { failure_details: null }, error: null },
      { data: { id: '00000000-0000-4000-8000-0000000000c1' }, error: null },
      { data: { failure_details: null }, error: null },
      { data: { id: '00000000-0000-4000-8000-0000000000c2' }, error: null }
    )
    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.6, lng: -85.3 }, hit429: false })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary).toMatchObject({
      claimed: 2,
      succeeded: 2,
      failedRetriable: 0,
      failedTerminal: 0,
      rate429Count: 0,
      processed: 2,
      publishTriggered: 2,
      publishOk: 2,
      publishFailed: 0,
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
      data: { failure_details: null },
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

  it('keeps backlog batch bounded and passes override to claim RPC', async () => {
    hoisted.adminRpc.mockResolvedValue({ data: [], error: null })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales({ batchSizeOverride: 25, cooldownMinutesOverride: 2 })

    expect(hoisted.adminRpc).toHaveBeenCalledWith('claim_ingested_sales_for_geocoding', {
      p_batch_size: 25,
      p_cooldown_minutes: 2,
    })
  })

  it('treats old stuck row shape as claim-eligible when returned by RPC', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '0cf56898-9e83-4172-8779-3da22cada7d2',
          normalized_address: null,
          address_raw: '742 Evergreen Terrace',
          geocode_attempts: 0,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { failure_details: null },
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { id: '0cf56898-9e83-4172-8779-3da22cada7d2' },
      error: null,
    })
    hoisted.geocodeAddress.mockResolvedValue({ coords: { lat: 38.55, lng: -85.55 }, hit429: false })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()

    expect(summary.claimed).toBe(1)
    expect(summary.succeeded).toBe(1)
    expect(hoisted.geocodeAddress).toHaveBeenCalledWith(
      {
        address: '742 Evergreen Terrace',
        city: 'Louisville',
        state: 'KY',
      },
      { mode: 'primary', classificationMode: 'strict' }
    )
  })

  it('surfaces claim RPC errors (no silent empty-claim fallback)', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: null,
      error: new Error('rpc failed'),
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await expect(geocodePendingSales()).rejects.toThrow('rpc failed')
  })

  it('invokes municipality fallback after earlier variants fail when authority city differs', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000f1',
          city: 'Orland Park',
          normalized_address: '123 oak st',
          address_raw: '123 Oak St, Palos Park, IL 60464',
          source_url:
            'https://yardsaletreasuremap.com/US/Illinois/Orland-Park/123-Oak-St/900/listing.html',
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push(
      { data: { failure_details: null }, error: null },
      { data: { id: '00000000-0000-4000-8000-0000000000f1' }, error: null }
    )
    hoisted.geocodeAddress.mockImplementation(async (q, opts) => {
      if (opts?.mode === 'fallback_arbitrated' && q.city === 'Palos Park') {
        return {
          coords: { lat: 41.62, lng: -87.85 },
          hit429: false,
          coordinatePrecision: 'exact_address',
          queryFingerprint: 'fp-fallback',
          providerClassification: 'ok',
          geocodeCityRaw: 'Palos Park',
          geocodeCityNormalized: 'Palos Park',
          attemptLog: {
            mode: 'fallback_arbitrated',
            queryStrategy: 'normalize_locality',
            queryFingerprint: 'fp-fallback',
          },
        }
      }
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'empty_results',
        providerClassification: 'empty_results',
        queryFingerprint: 'fp-primary',
        geocodeCityRaw: q.city,
        geocodeCityNormalized: q.city,
        attemptLog: {
          mode: opts?.mode ?? 'primary',
          queryStrategy: 'minimal_locality',
          queryFingerprint: 'fp-primary',
        },
      }
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    const summary = await geocodePendingSales()
    expect(summary.succeeded).toBe(1)
    expect(hoisted.geocodeAddress.mock.calls.length).toBeGreaterThanOrEqual(2)
    const fallbackCall = hoisted.geocodeAddress.mock.calls.find(
      (c) => c[1]?.mode === 'fallback_arbitrated' && c[0]?.city === 'Palos Park'
    )
    expect(fallbackCall).toBeDefined()
    expect(hoisted.geocodeAddress.mock.calls[0]?.[0]).toMatchObject({ city: 'Orland Park' })
  })

  it('failed low_confidence attempt persists lowConfidenceReasons on failure_details.geocode', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b5',
          normalized_address: '800 Low Conf',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { failure_details: null },
      error: null,
    })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: false,
      noCoordsReason: 'low_confidence',
      providerClassification: 'low_confidence',
      queryFingerprint: 'fp-lowconf',
      lowConfidenceReasons: ['broad_match', 'city_mismatch'],
      geocodeCityRaw: 'Louisville',
      geocodeCityNormalized: 'Louisville',
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    const diagUpdate = hoisted.updatePayloads.find(
      (u) =>
        u &&
        typeof u === 'object' &&
        (u as Record<string, unknown>).failure_details != null &&
        typeof (u as Record<string, unknown>).failure_details === 'object' &&
        'geocode' in ((u as Record<string, unknown>).failure_details as object)
    ) as Record<string, unknown> | undefined
    const geocode = (
      diagUpdate?.failure_details as {
        geocode?: { lowConfidenceReasons?: string[]; providerClassification?: string }
      }
    )?.geocode
    expect(geocode?.lowConfidenceReasons).toEqual(['broad_match', 'city_mismatch'])
    expect(geocode?.providerClassification).toBe('low_confidence')
  })

  it('failed rate_limited attempt persists providerClassification rate_limited', async () => {
    hoisted.adminRpc.mockResolvedValue({
      data: [
        {
          ...claimedRowBase,
          id: '00000000-0000-4000-8000-0000000000b6',
          normalized_address: '900 Rate St',
          address_raw: null,
          geocode_attempts: 1,
        },
      ],
      error: null,
    })
    hoisted.maybeSingleResults.push({
      data: { failure_details: null },
      error: null,
    })
    hoisted.geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: true,
      noCoordsReason: 'rate_limited',
      providerClassification: 'rate_limited',
      queryFingerprint: 'fp429',
      geocodeCityRaw: 'Louisville',
      geocodeCityNormalized: 'Louisville',
    })

    const { geocodePendingSales } = await import('@/lib/ingestion/geocodeWorker')
    await geocodePendingSales()

    const diagUpdate = hoisted.updatePayloads.find(
      (u) =>
        u &&
        typeof u === 'object' &&
        (u as Record<string, unknown>).failure_details != null &&
        typeof (u as Record<string, unknown>).failure_details === 'object' &&
        'geocode' in ((u as Record<string, unknown>).failure_details as object)
    ) as Record<string, unknown> | undefined
    const geocode = (diagUpdate?.failure_details as { geocode?: { providerClassification?: string } })?.geocode
    expect(geocode?.providerClassification).toBe('rate_limited')
  })
})

describe('ingested geocode failure_details helpers', () => {
  it('buildIngestedGeocodeFailureDetailsV1 maps provider fields and fingerprint', () => {
    const geo = {
      coords: null,
      hit429: false,
      noCoordsReason: 'empty_results',
      providerClassification: 'empty_results',
      queryFingerprint: 'abcfpr19',
      geocodeCityRaw: 'Louisville',
      geocodeCityNormalized: 'Louisville',
    } as GeocodeAddressOutcome
    const d = buildIngestedGeocodeFailureDetailsV1(2, geo, '')
    expect(d.schema_version).toBe(1)
    expect(d.attemptCount).toBe(2)
    expect(d.providerClassification).toBe('empty_results')
    expect(d.queryFingerprint).toBe('abcfpr19')
    expect(d.geocode_city_raw).toBe('Louisville')
    expect(d.geocode_city_normalized).toBe('Louisville')
  })

  it('mergeFailureDetailsWithGeocodeAttempt preserves publish-shaped keys', () => {
    const geo = {
      coords: null,
      hit429: false,
      providerClassification: 'empty_results',
      geocodeCityRaw: 'X',
      geocodeCityNormalized: 'X',
    } as GeocodeAddressOutcome
    const g = buildIngestedGeocodeFailureDetailsV1(1, geo, '')
    const merged = mergeFailureDetailsWithGeocodeAttempt(
      { phase: 'create_sale', publish_error: 'timeout' },
      g
    )
    expect(merged.phase).toBe('create_sale')
    expect(merged.publish_error).toBe('timeout')
    expect((merged.geocode as { providerClassification?: string }).providerClassification).toBe('empty_results')
  })

  it('removeGeocodeSubDocumentFromFailureDetails yields null when only geocode remained', () => {
    const geo = {
      coords: null,
      hit429: false,
      providerClassification: 'ok',
      geocodeCityRaw: 'Y',
      geocodeCityNormalized: 'Y',
    } as GeocodeAddressOutcome
    const g = buildIngestedGeocodeFailureDetailsV1(1, geo, '')
    const onlyGeocode = mergeFailureDetailsWithGeocodeAttempt(null, g)
    expect(removeGeocodeSubDocumentFromFailureDetails(onlyGeocode)).toBeNull()
  })
})
