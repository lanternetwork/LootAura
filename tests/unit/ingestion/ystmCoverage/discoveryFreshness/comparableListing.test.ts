import { describe, expect, it } from 'vitest'
import {
  isComparableYstmListingObservation,
  isDiscoveryLatencyProxyOnly,
} from '@/lib/ingestion/ystmCoverage/discoveryFreshness/comparableListing'

describe('comparableListing', () => {
  it('accepts valid active listings without terminal address buckets', () => {
    expect(
      isComparableYstmListingObservation({
        ystmValidActive: true,
        falseExclusionPrimaryBucket: null,
        ystmInvalidReason: null,
      })
    ).toBe(true)
  })

  it('rejects expired and terminal address gated listings', () => {
    expect(
      isComparableYstmListingObservation({
        ystmValidActive: false,
        falseExclusionPrimaryBucket: null,
        ystmInvalidReason: null,
      })
    ).toBe(false)
    expect(
      isComparableYstmListingObservation({
        ystmValidActive: true,
        falseExclusionPrimaryBucket: 'address_unavailable_terminal',
        ystmInvalidReason: null,
      })
    ).toBe(false)
  })

  it('detects observation proxy appearance source', () => {
    expect(isDiscoveryLatencyProxyOnly('observation_proxy')).toBe(true)
    expect(isDiscoveryLatencyProxyOnly('ystm_metadata')).toBe(false)
  })
})
