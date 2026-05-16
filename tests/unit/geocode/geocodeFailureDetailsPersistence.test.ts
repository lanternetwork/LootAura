import { describe, expect, it } from 'vitest'
import type { GeocodeAddressOutcome } from '@/lib/geocode/geocodeAddress'
import {
  buildIngestedGeocodeFailureDetailsV2,
  type GeocodeAttemptDiagnostic,
} from '@/lib/ingestion/geocodeWorker'

describe('buildIngestedGeocodeFailureDetailsV2 persistence (P0 no full query in DB)', () => {
  it('does not persist raw geocode query text in failure_details JSON', () => {
    const sensitive = '123 Fake St Unit 9, Springfield, IL, USA'
    const attempts: GeocodeAttemptDiagnostic[] = [
      {
        strategy: 'primary',
        queryStrategy: 'minimal_locality',
        addressSource: 'normalized_address',
        municipalitySource: 'row',
        fallbackArbitrationApplied: false,
        queryCharLength: sensitive.length,
        queryFingerprint: 'fp-test',
        resultType: 'empty_results',
      },
    ]
    const geo: GeocodeAddressOutcome = {
      coords: null,
      hit429: false,
      noCoordsReason: 'empty_results',
      providerClassification: 'empty_results',
      queryFingerprint: 'fp-geo',
      geocodeCityRaw: 'Springfield',
      geocodeCityNormalized: 'Springfield',
      attemptLog: {
        mode: 'primary',
        queryStrategy: 'minimal_locality',
        queryString: sensitive,
        queryFingerprint: 'fp-geo',
      },
    }
    const details = buildIngestedGeocodeFailureDetailsV2(1, geo, 'Springfield', attempts)
    const json = JSON.stringify(details)
    expect(json).not.toContain('123 Fake')
    expect(json).not.toContain('Fake St')
    expect(json).not.toContain(sensitive)
    expect(json).not.toContain('queryString')
    expect((details.attempts as GeocodeAttemptDiagnostic[])[0]?.queryCharLength).toBe(sensitive.length)
  })
})
