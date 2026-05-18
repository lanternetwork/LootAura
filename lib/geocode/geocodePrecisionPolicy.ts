/** Phase D2 precision / confidence policy (publish gates + variant ranking). */

export const MAX_PROVIDER_CALLS_PER_GEOCODE_CLAIM = 6 as const

export const GEOCODE_CONFIDENCES = ['high', 'medium', 'low'] as const
export type GeocodeConfidence = (typeof GEOCODE_CONFIDENCES)[number]

export const COORDINATE_PRECISIONS = [
  'exact_address',
  'intersection',
  'interpolated',
  'locality',
  'city_centroid',
  'provider_native',
] as const
export type CoordinatePrecision = (typeof COORDINATE_PRECISIONS)[number]

export const GEOCODE_METHODS = [
  'nominatim_exact',
  'nominatim_intersection',
  'nominatim_interpolated',
  'nominatim_locality',
  'nominatim_municipality_fallback',
  'ystm_provider_native',
  'address_geocode_cache',
] as const
export type GeocodeMethod = (typeof GEOCODE_METHODS)[number]

const NON_PUBLISHABLE: ReadonlySet<CoordinatePrecision> = new Set(['locality', 'city_centroid'])

/** Lower rank = preferred when comparing matches. */
const PRECISION_RANK: Record<CoordinatePrecision, number> = {
  exact_address: 0,
  provider_native: 0,
  intersection: 1,
  interpolated: 2,
  locality: 90,
  city_centroid: 91,
}

export function precisionRank(p: CoordinatePrecision): number {
  return PRECISION_RANK[p] ?? 99
}

export function isCoordinatePrecisionPublishable(precision: string | null | undefined): boolean {
  if (precision == null || precision.trim() === '') return true
  return !NON_PUBLISHABLE.has(precision as CoordinatePrecision)
}

export function isAcceptablePublishableMatch(precision: CoordinatePrecision): boolean {
  return precision === 'exact_address' || precision === 'intersection'
}

export function methodForPrecision(precision: CoordinatePrecision, municipalityFallback: boolean): GeocodeMethod {
  if (municipalityFallback && precision === 'exact_address') {
    return 'nominatim_municipality_fallback'
  }
  switch (precision) {
    case 'intersection':
      return 'nominatim_intersection'
    case 'interpolated':
      return 'nominatim_interpolated'
    case 'locality':
    case 'city_centroid':
      return 'nominatim_locality'
    default:
      return 'nominatim_exact'
  }
}

export function confidenceForPrecision(precision: CoordinatePrecision): GeocodeConfidence {
  if (precision === 'exact_address' || precision === 'provider_native') return 'high'
  if (precision === 'intersection') return 'medium'
  return 'low'
}
