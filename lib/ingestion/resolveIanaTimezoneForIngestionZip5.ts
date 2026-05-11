import { createRequire } from 'node:module'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import zipcodes from 'zipcodes'

const require = createRequire(import.meta.url)
// Vendored MIT `tz-lookup@6.1.25` (lat/lng → IANA); see `lib/vendor/tz-lookup/tz.cjs`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tzlookup = require('../vendor/tz-lookup/tz.cjs') as (lat: number, lng: number) => string

type AdminDb = ReturnType<typeof getAdminDb>

export type IngestionZipCoordinateSource = 'zipcodes_database' | 'zipcodes_npm_package'

function isValidIanaTimeZoneId(zone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format()
    return true
  } catch {
    return false
  }
}

function ianaFromLatLng(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const z = tzlookup(lat, lng) as unknown
    const id = Array.isArray(z) ? (typeof z[0] === 'string' ? z[0] : null) : typeof z === 'string' ? z : null
    if (!id || !isValidIanaTimeZoneId(id)) return null
    return id
  } catch {
    return null
  }
}

/**
 * Resolves an IANA timezone from a US ZIP5 using coordinates (DB first, then `zipcodes` npm),
 * then `tz-lookup` on lat/lng. No `DEFAULT_TIMEZONE` fallback.
 */
export async function resolveIanaTimezoneForIngestionZip5(
  admin: AdminDb,
  args: { zip5: string; expectedState: string }
): Promise<{ iana: string; coordinateSource: IngestionZipCoordinateSource } | null> {
  const expected = String(args.expectedState || '')
    .trim()
    .toUpperCase()
  if (!/^[A-Z]{2}$/.test(expected)) return null

  const zip5 = String(args.zip5 || '').trim()
  if (!/^\d{5}$/.test(zip5)) return null

  const { data, error } = await fromBase(admin, 'zipcodes')
    .select('lat,lng,state')
    .eq('zip_code', zip5)
    .maybeSingle()

  if (!error && data && data.lat != null && data.lng != null) {
    const rowState = String((data as { state?: string }).state || '')
      .trim()
      .toUpperCase()
    if (rowState && rowState !== expected) {
      return null
    }
    const lat = Number((data as { lat: unknown }).lat)
    const lng = Number((data as { lng: unknown }).lng)
    const iana = ianaFromLatLng(lat, lng)
    if (iana) return { iana, coordinateSource: 'zipcodes_database' }
  }

  const rec = zipcodes.lookup(zip5) as { latitude?: number; longitude?: number; state?: string } | null
  if (!rec || rec.latitude == null || rec.longitude == null) return null
  const pkgState = String(rec.state || '')
    .trim()
    .toUpperCase()
  if (pkgState && pkgState !== expected) {
    return null
  }
  const iana = ianaFromLatLng(Number(rec.latitude), Number(rec.longitude))
  if (!iana) return null
  return { iana, coordinateSource: 'zipcodes_npm_package' }
}
