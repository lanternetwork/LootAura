import {
  resolveUsListStatePathSegment,
  uspsCodeToFullNameForAddress,
} from '@/lib/ingestion/adapters/usStateListPathSegment'

export type NativeCoordinateValidationFailure =
  | 'non_finite'
  | 'null_island'
  | 'outside_us'
  | 'state_mismatch'
  | 'state_implausible'

const US_LAT_MIN = 18.0
const US_LAT_MAX = 72.0
const US_LNG_MIN = -180.0
const US_LNG_MAX = -65.0

/** Rough state centroids (km radius check). */
const STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AL: { lat: 32.8, lng: -86.8 },
  AK: { lat: 64.2, lng: -149.5 },
  AZ: { lat: 34.3, lng: -111.7 },
  AR: { lat: 34.8, lng: -92.2 },
  CA: { lat: 37.2, lng: -119.5 },
  CO: { lat: 39.0, lng: -105.5 },
  CT: { lat: 41.6, lng: -72.7 },
  DE: { lat: 39.0, lng: -75.5 },
  DC: { lat: 38.9, lng: -77.0 },
  FL: { lat: 28.6, lng: -82.4 },
  GA: { lat: 32.6, lng: -83.4 },
  HI: { lat: 20.8, lng: -156.3 },
  ID: { lat: 44.4, lng: -114.6 },
  IL: { lat: 40.0, lng: -89.2 },
  IN: { lat: 39.9, lng: -86.3 },
  IA: { lat: 42.0, lng: -93.5 },
  KS: { lat: 38.5, lng: -98.4 },
  KY: { lat: 37.8, lng: -85.7 },
  LA: { lat: 31.0, lng: -92.0 },
  ME: { lat: 45.4, lng: -69.2 },
  MD: { lat: 39.0, lng: -76.8 },
  MA: { lat: 42.4, lng: -71.8 },
  MI: { lat: 44.3, lng: -85.6 },
  MN: { lat: 46.3, lng: -94.3 },
  MS: { lat: 32.7, lng: -89.7 },
  MO: { lat: 38.5, lng: -92.4 },
  MT: { lat: 47.0, lng: -109.6 },
  NE: { lat: 41.5, lng: -99.8 },
  NV: { lat: 39.3, lng: -116.6 },
  NH: { lat: 43.5, lng: -71.6 },
  NJ: { lat: 40.1, lng: -74.7 },
  NM: { lat: 34.5, lng: -106.1 },
  NY: { lat: 43.0, lng: -75.5 },
  NC: { lat: 35.6, lng: -79.4 },
  ND: { lat: 47.5, lng: -100.5 },
  OH: { lat: 40.4, lng: -82.8 },
  OK: { lat: 35.6, lng: -97.5 },
  OR: { lat: 44.0, lng: -120.5 },
  PA: { lat: 40.9, lng: -77.8 },
  RI: { lat: 41.7, lng: -71.5 },
  SC: { lat: 33.9, lng: -80.9 },
  SD: { lat: 44.4, lng: -100.2 },
  TN: { lat: 35.8, lng: -86.3 },
  TX: { lat: 31.5, lng: -99.3 },
  UT: { lat: 39.3, lng: -111.7 },
  VT: { lat: 44.1, lng: -72.7 },
  VA: { lat: 37.5, lng: -78.7 },
  WA: { lat: 47.4, lng: -120.5 },
  WV: { lat: 38.6, lng: -80.6 },
  WI: { lat: 44.6, lng: -89.8 },
  WY: { lat: 43.0, lng: -107.5 },
}

const MAX_STATE_RADIUS_KM = 520

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalizePathSegment(seg: string): string {
  return seg.trim().toLowerCase().replace(/-/g, ' ')
}

function ystmPathStateMatchesRow(sourceUrl: string | null | undefined, state: string): boolean {
  if (!sourceUrl?.trim()) return true
  try {
    const parts = new URL(sourceUrl.trim()).pathname.split('/').filter(Boolean)
    if (parts[0]?.toUpperCase() !== 'US' || !parts[1]) return true
    const pathState = normalizePathSegment(parts[1])
    const usps = state.trim().toUpperCase()
    if (usps.length === 2) {
      const full = uspsCodeToFullNameForAddress(usps)
      if (full && normalizePathSegment(full) === pathState) return true
      const seg = resolveUsListStatePathSegment(usps)
      if (seg && normalizePathSegment(seg) === pathState) return true
      return false
    }
    return normalizePathSegment(state) === pathState
  } catch {
    return true
  }
}

export function validateNativeCoordinates(input: {
  lat: number
  lng: number
  city?: string | null
  state: string
  sourceUrl?: string | null
}): { ok: true } | { ok: false; reason: NativeCoordinateValidationFailure } {
  const { lat, lng, state, sourceUrl } = input
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'non_finite' }
  }
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
    return { ok: false, reason: 'null_island' }
  }
  if (lat < US_LAT_MIN || lat > US_LAT_MAX || lng < US_LNG_MIN || lng > US_LNG_MAX) {
    return { ok: false, reason: 'outside_us' }
  }
  if (!ystmPathStateMatchesRow(sourceUrl, state)) {
    return { ok: false, reason: 'state_mismatch' }
  }
  const usps = state.trim().toUpperCase()
  if (usps.length === 2) {
    const centroid = STATE_CENTROIDS[usps]
    if (centroid && haversineKm(centroid.lat, centroid.lng, lat, lng) > MAX_STATE_RADIUS_KM) {
      return { ok: false, reason: 'state_implausible' }
    }
  }
  return { ok: true }
}
