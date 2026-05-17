import { describe, expect, it } from 'vitest'
import {
  MAX_PROVIDER_CALLS_PER_GEOCODE_CLAIM,
  isAcceptablePublishableMatch,
  isCoordinatePrecisionPublishable,
  precisionRank,
} from '@/lib/geocode/geocodePrecisionPolicy'

describe('geocodePrecisionPolicy', () => {
  it('caps provider calls per claim at 6', () => {
    expect(MAX_PROVIDER_CALLS_PER_GEOCODE_CLAIM).toBe(6)
  })

  it('treats locality and city_centroid as non-publishable', () => {
    expect(isCoordinatePrecisionPublishable('locality')).toBe(false)
    expect(isCoordinatePrecisionPublishable('city_centroid')).toBe(false)
    expect(isCoordinatePrecisionPublishable('exact_address')).toBe(true)
    expect(isCoordinatePrecisionPublishable(null)).toBe(true)
  })

  it('only accepts exact_address and intersection as publishable matches', () => {
    expect(isAcceptablePublishableMatch('exact_address')).toBe(true)
    expect(isAcceptablePublishableMatch('intersection')).toBe(true)
    expect(isAcceptablePublishableMatch('interpolated')).toBe(false)
    expect(isAcceptablePublishableMatch('locality')).toBe(false)
  })

  it('ranks exact_address ahead of intersection', () => {
    expect(precisionRank('exact_address')).toBeLessThan(precisionRank('intersection'))
  })
})
