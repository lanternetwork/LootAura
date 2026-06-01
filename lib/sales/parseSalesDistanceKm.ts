/** Max radius aligned with legacy GET /api/sales cap (km). */
export const SALES_MAX_DISTANCE_KM = 160

export function clampSalesDistanceKm(km: number): number {
  return Math.max(1, Math.min(km, SALES_MAX_DISTANCE_KM))
}

type SearchParamsReader = Pick<URLSearchParams, 'get'>

/**
 * Canonical marketplace distance filter (km) from radiusKm.
 */
export function parseSalesRadiusKmFromParams(searchParams: SearchParamsReader): number | undefined {
  const radiusKmRaw = searchParams.get('radiusKm')
  if (radiusKmRaw == null || radiusKmRaw === '') {
    return undefined
  }

  const parsed = parseFloat(radiusKmRaw)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined
  }

  return clampSalesDistanceKm(parsed)
}

/**
 * Bbox marketplace fetch distance (km).
 * Prefers radiusKm; falls back to deprecated dist/distance when present.
 */
export function parseBboxSalesDistanceKm(
  searchParams: SearchParamsReader,
  onDeprecatedParam?: (param: 'dist' | 'distance') => void
): number | undefined {
  const fromRadius = parseSalesRadiusKmFromParams(searchParams)
  if (fromRadius !== undefined) {
    return fromRadius
  }

  const distParam = searchParams.get('dist')
  const distanceParam = searchParams.get('distance')
  const deprecatedRaw = distParam ?? distanceParam
  if (deprecatedRaw == null || deprecatedRaw === '') {
    return undefined
  }

  onDeprecatedParam?.(distParam ? 'dist' : 'distance')

  const parsed = parseFloat(deprecatedRaw)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined
  }

  return clampSalesDistanceKm(parsed)
}
