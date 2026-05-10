import { describe, expect, it } from 'vitest'
import {
  buildGeocodeAttemptPlan,
  isMetadataOnlyAddressSource,
  primaryAndFallbackCitiesEquivalent,
  streetLineForGeocodeAttempt,
} from '@/lib/ingestion/geocodeAttemptPlan'

describe('geocodeAttemptPlan', () => {
  it('prefers address_raw as visible line when both raw and normalized exist', () => {
    const { line, source } = streetLineForGeocodeAttempt({
      address_raw: '123 Oak St, Palos Park, IL 60464',
      normalized_address: '123 oak st',
    })
    expect(source).toBe('address_raw')
    expect(line).toContain('Palos Park')
  })

  it('primary municipality uses listing URL for YSTM before row_city', () => {
    const plan = buildGeocodeAttemptPlan({
      address_raw: '100 Main St',
      normalized_address: null,
      city: 'Chicago',
      state: 'IL',
      source_url: 'https://yardsaletreasuremap.com/US/Illinois/Lindenhurst/100-Main-St/1/listing.html',
      raw_payload: {},
    })
    expect(plan.primaryCity).toBe('Lindenhurst')
    expect(plan.primaryMunicipalitySource).toBe('listing_url')
    expect(plan.fallbackMunicipalitySource).toBe('authority_resolved')
  })

  it('metadata-only address sources force URL municipality for primary, not row city', () => {
    const rawPayload = { ingestionDiagnostics: { addressSources: ['metadata'] } }
    expect(isMetadataOnlyAddressSource(rawPayload)).toBe(true)
    const plan = buildGeocodeAttemptPlan({
      address_raw: '900 Shared Rd, Munster, IN 46321',
      normalized_address: null,
      city: 'Valparaiso',
      state: 'IN',
      source_url: 'https://yardsaletreasuremap.com/US/Indiana/Valparaiso/100-Main-St/201/listing.html',
      raw_payload: rawPayload,
    })
    expect(plan.primaryMunicipalitySource).toBe('listing_url_metadata_guard')
    expect(plan.primaryCity).toBe('Valparaiso')
  })

  it('fallback city uses authority when URL slug and tail disagree', () => {
    const plan = buildGeocodeAttemptPlan({
      address_raw: '123 Oak St, Palos Park, IL 60464',
      normalized_address: null,
      city: 'Orland Park',
      state: 'IL',
      source_url: 'https://yardsaletreasuremap.com/US/Illinois/Orland-Park/123-Oak-St/900/listing.html',
      raw_payload: {},
    })
    expect(plan.primaryCity).toBe('Orland Park')
    expect(plan.fallbackCity).toBe('Palos Park')
    expect(primaryAndFallbackCitiesEquivalent(plan.primaryCity, plan.fallbackCity)).toBe(false)
  })
})
