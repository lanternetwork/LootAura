import { describe, expect, it } from 'vitest'
import { buildGeocodeVariantSequence } from '@/lib/geocode/buildGeocodeVariantSequence'
import type { GeocodeAttemptPlan } from '@/lib/ingestion/geocodeAttemptPlan'

function plan(overrides: Partial<GeocodeAttemptPlan>): GeocodeAttemptPlan {
  return {
    addressLine: '123 Oak St, Orland Park, IL 60464',
    addressLineSource: 'address_raw',
    state: 'IL',
    primaryCity: 'Orland Park',
    primaryMunicipalitySource: 'row_city',
    fallbackCity: 'Palos Park',
    fallbackMunicipalitySource: 'authority_resolved',
    ...overrides,
  }
}

describe('buildGeocodeVariantSequence', () => {
  it('orders primary, unit strip, no_zip, municipality fallback, then locality metadata', () => {
    const ids = buildGeocodeVariantSequence(plan({})).map((v) => v.variantId)
    expect(ids[0]).toBe('primary_full')
    expect(ids).toContain('no_zip')
    expect(ids).toContain('municipality_fallback')
    expect(ids[ids.length - 1]).toBe('locality_metadata_only')
  })

  it('ends locality variant with allow_broad_locality and empty address', () => {
    const locality = buildGeocodeVariantSequence(plan({})).find(
      (v) => v.variantId === 'locality_metadata_only'
    )
    expect(locality?.classificationMode).toBe('allow_broad_locality')
    expect(locality?.addressLine).toBe('')
  })

  it('returns empty sequence without state', () => {
    expect(buildGeocodeVariantSequence(plan({ state: '' }))).toEqual([])
  })
})
