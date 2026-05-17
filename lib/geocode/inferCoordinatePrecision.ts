import { isIntersectionOrHighwayLine } from '@/lib/geocode/normalizeGeocodeAddress'
import type { CoordinatePrecision } from '@/lib/geocode/geocodePrecisionPolicy'

export function inferCoordinatePrecision(input: {
  addressLine: string
  classificationMode: 'strict' | 'allow_broad_locality'
  broadMatch: boolean
}): CoordinatePrecision {
  if (input.classificationMode === 'allow_broad_locality' || input.broadMatch) {
    return input.broadMatch ? 'city_centroid' : 'locality'
  }
  if (isIntersectionOrHighwayLine(input.addressLine)) return 'intersection'
  return 'exact_address'
}
