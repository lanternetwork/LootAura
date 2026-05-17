import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { GeocodeAttemptPlan } from '@/lib/ingestion/geocodeAttemptPlan'

const geocodeAddress = vi.fn()

vi.mock('@/lib/geocode/geocodeAddress', () => ({
  geocodeAddress,
}))

function plan(overrides: Partial<GeocodeAttemptPlan> = {}): GeocodeAttemptPlan {
  return {
    addressLine: '1 Main St',
    addressLineSource: 'normalized_address',
    state: 'NY',
    primaryCity: 'Albany',
    primaryMunicipalitySource: 'row_city',
    fallbackCity: 'Auburn',
    fallbackMunicipalitySource: 'listing_url',
    ...overrides,
  }
}

describe('runBoundedGeocodeVariants', () => {
  beforeEach(() => {
    geocodeAddress.mockReset()
  })

  it('stops at first publishable exact_address match', async () => {
    geocodeAddress.mockResolvedValue({
      coords: { lat: 42.65, lng: -73.75 },
      hit429: false,
      coordinatePrecision: 'exact_address',
      geocodeConfidence: 'high',
      geocodeMethod: 'nominatim_exact',
    })

    const { runBoundedGeocodeVariants } = await import('@/lib/geocode/runBoundedGeocodeVariants')
    const result = await runBoundedGeocodeVariants(plan())

    expect(result.publishable?.coordinatePrecision).toBe('exact_address')
    expect(result.providerCalls).toBe(1)
    expect(geocodeAddress).toHaveBeenCalledTimes(1)
  })

  it('never publishes locality-only coords but records metadata', async () => {
    geocodeAddress.mockImplementation(async (_q, opts) => {
      if (opts?.classificationMode === 'allow_broad_locality') {
        return {
          coords: { lat: 42.6, lng: -73.7 },
          hit429: false,
          coordinatePrecision: 'locality',
          geocodeConfidence: 'low',
          geocodeMethod: 'nominatim_locality',
        }
      }
      return {
        coords: null,
        hit429: false,
        noCoordsReason: 'empty_results',
        providerClassification: 'empty_results',
      }
    })

    const { runBoundedGeocodeVariants } = await import('@/lib/geocode/runBoundedGeocodeVariants')
    const result = await runBoundedGeocodeVariants(
      plan({ fallbackCity: '', addressLine: 'Corner of X & Y' })
    )

    expect(result.publishable).toBeUndefined()
    expect(result.localityMetadataOnly?.coordinatePrecision).toBe('locality')
  })

  it('does not exceed max provider calls per claim', async () => {
    geocodeAddress.mockResolvedValue({
      coords: null,
      hit429: false,
      noCoordsReason: 'empty_results',
      providerClassification: 'empty_results',
    })

    const { runBoundedGeocodeVariants } = await import('@/lib/geocode/runBoundedGeocodeVariants')
    const result = await runBoundedGeocodeVariants(plan())

    expect(result.providerCalls).toBeLessThanOrEqual(6)
    expect(geocodeAddress.mock.calls.length).toBeLessThanOrEqual(6)
  })
})
