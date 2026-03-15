/**
 * Deterministic spread of points around a center for admin test-sales generator.
 * Uses a simple grid so pins look clean and consistent for demos.
 * Pure functions, no I/O — safe to unit test.
 */

export interface SpreadPoint {
  lat: number
  lng: number
}

const US_ZIP_REGEX = /^\d{5}$/

/**
 * Normalize and validate US 5-digit ZIP. Returns null if invalid.
 */
export function normalizeZipForValidation(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 0) return null
  const five = digits.length >= 5 ? digits.slice(0, 5) : digits.padStart(5, '0')
  return US_ZIP_REGEX.test(five) ? five : null
}

/**
 * Return status for each of the n sales: biased toward published; optional 1 draft, 1 archived.
 */
export function batchStatuses(
  count: number,
  publishedOnly: boolean
): ('published' | 'draft' | 'archived')[] {
  if (count <= 0) return []
  if (publishedOnly) {
    return Array.from({ length: count }, () => 'published')
  }
  const numDraft = count >= 2 ? 1 : 0
  const numArchived = count >= 3 ? 1 : 0
  const numPublished = Math.max(0, count - numDraft - numArchived)
  return [
    ...Array.from({ length: numPublished }, () => 'published' as const),
    ...Array.from({ length: numDraft }, () => 'draft' as const),
    ...Array.from({ length: numArchived }, () => 'archived' as const),
  ]
}

export interface BatchReport {
  requested: number
  succeeded: number
  zip: string
  city: string
  state: string
  failureMessage: string | null
}

/**
 * Build batch report for admin test-sales generator. Enables testing partial-failure reporting.
 */
export function buildBatchReport(
  requested: number,
  succeeded: number,
  zip: string,
  city: string,
  state: string,
  failureMessage: string | null
): BatchReport {
  return { requested, succeeded, zip, city, state, failureMessage }
}

/**
 * Generate deterministic (lat, lng) points in a grid around a center.
 * Same inputs always produce the same outputs.
 *
 * @param centerLat - Center latitude
 * @param centerLng - Center longitude
 * @param count - Number of points (1..n)
 * @param radiusDegrees - Half-width of the grid in degrees (~0.01 ≈ 1.1 km at mid-latitudes)
 */
export function deterministicSpread(
  centerLat: number,
  centerLng: number,
  count: number,
  radiusDegrees: number
): SpreadPoint[] {
  if (count <= 0 || radiusDegrees <= 0) {
    return []
  }
  if (count === 1) {
    return [{ lat: centerLat, lng: centerLng }]
  }

  const side = Math.ceil(Math.sqrt(count))
  const step = (2 * radiusDegrees) / Math.max(side, 1)
  const latRad = (centerLat * Math.PI) / 180
  const lngScale = 1 / Math.cos(latRad)

  const points: SpreadPoint[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / side)
    const col = i % side
    const x = (col - side / 2 + 0.5) * step
    const y = (row - side / 2 + 0.5) * step
    points.push({
      lat: centerLat + y,
      lng: centerLng + x * lngScale,
    })
  }
  return points
}
