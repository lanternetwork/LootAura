/**
 * Deterministic spread of points around a center for admin test-sales generator.
 * Uses a seeded scatter so pins look organic and believable for demos.
 * Pure functions, no I/O — safe to unit test.
 */

export interface SpreadPoint {
  lat: number
  lng: number
}

/** Minimal sale record built client-side after create (API returns only saleId). */
export interface CreatedSale {
  id: string
  title: string
  status: string
  date_start: string
}

/**
 * Whether resolved ZIP metadata is complete enough for sale creation (admin Test Sales Generator).
 * Matches /api/sales requirement: state must be present and length >= 2; city must be present and not generic.
 */
export function isCompleteZipResolution(geo: {
  city?: string | null
  state?: string | null
}): boolean {
  const cityOk =
    geo.city != null &&
    typeof geo.city === 'string' &&
    geo.city.trim() !== '' &&
    geo.city.trim() !== 'Unknown'
  const stateOk =
    typeof geo.state === 'string' && geo.state.trim().length >= 2
  return cityOk && stateOk
}

/**
 * Build CreatedSale from create response so the admin generator never has undefined in the list.
 * API returns only { ok, saleId } (or saleId as id). Throws if no id.
 */
export function buildCreatedSaleFromCreateResponse(
  data: { saleId?: string; id?: string },
  title: string,
  status: string,
  date_start: string
): CreatedSale {
  const id = data.saleId ?? data.id
  if (!id || typeof id !== 'string') {
    throw new Error('Create succeeded but no sale id returned')
  }
  return { id, title, status, date_start }
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

/** Mulberry32 seeded RNG. Returns 0..1. */
function mulberry32(seed: number): () => number {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Derive a stable integer seed from ZIP + count + radius for deterministic scatter.
 */
export function scatterSeed(zip: string, count: number, radiusDegrees: number): number {
  const s = `${zip}:${count}:${radiusDegrees}`
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

const MIN_SEPARATION_FRAC = 0.2 // min distance between points as fraction of radius
const MAX_PLACE_ATTEMPTS = 80

/**
 * Generate deterministic scattered (lat, lng) points around a center.
 * Same inputs + seed always produce the same outputs. No grid; min separation enforced.
 *
 * @param centerLat - Center latitude
 * @param centerLng - Center longitude
 * @param count - Number of points (1..n)
 * @param radiusDegrees - Max distance from center in degrees
 * @param seed - Integer seed for reproducibility (e.g. from scatterSeed(zip, count, radius))
 */
export function deterministicScatter(
  centerLat: number,
  centerLng: number,
  count: number,
  radiusDegrees: number,
  seed: number
): SpreadPoint[] {
  if (count <= 0 || radiusDegrees <= 0) {
    return []
  }
  if (count === 1) {
    return [{ lat: centerLat, lng: centerLng }]
  }

  const rng = mulberry32(seed)
  const latRad = (centerLat * Math.PI) / 180
  const lngScale = 1 / Math.cos(latRad)
  const minSep = radiusDegrees * MIN_SEPARATION_FRAC
  const minSepSq = minSep * minSep

  function distSq(a: SpreadPoint, b: SpreadPoint): number {
    const dLat = a.lat - b.lat
    const dLng = (a.lng - b.lng) * lngScale
    return dLat * dLat + dLng * dLng
  }

  const points: SpreadPoint[] = []
  for (let i = 0; i < count; i++) {
    let placed = false
    for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS && !placed; attempt++) {
      const angle = rng() * 2 * Math.PI
      const r = radiusDegrees * Math.sqrt(rng()) // sqrt for more uniform area density
      const y = r * Math.sin(angle)
      const x = r * Math.cos(angle)
      const lat = centerLat + y
      const lng = centerLng + x / lngScale
      const candidate: SpreadPoint = { lat, lng }
      const tooClose = points.some((p) => distSq(p, candidate) < minSepSq)
      if (!tooClose) {
        points.push(candidate)
        placed = true
      }
    }
    if (!placed) {
      const fallbackR = radiusDegrees * (0.3 + (rng() * 0.6))
      const fallbackAngle = rng() * 2 * Math.PI
      points.push({
        lat: centerLat + fallbackR * Math.sin(fallbackAngle),
        lng: centerLng + (fallbackR * Math.cos(fallbackAngle)) / lngScale,
      })
    }
  }
  return points
}

/**
 * @deprecated Use deterministicScatter with scatterSeed for organic-looking pins.
 * Kept for tests that assert on legacy grid behavior.
 */
export function deterministicSpread(
  centerLat: number,
  centerLng: number,
  count: number,
  radiusDegrees: number
): SpreadPoint[] {
  const seed = scatterSeed('grid', count, radiusDegrees)
  return deterministicScatter(centerLat, centerLng, count, radiusDegrees, seed)
}
