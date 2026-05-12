import { getAdminDb } from '@/lib/supabase/clients'
import {
  resolveIanaTimezoneForIngestionZip5,
  resolveIanaTimezoneFromLatLng,
} from '@/lib/ingestion/resolveIanaTimezoneForIngestionZip5'

export type AdminDbForListingTz = ReturnType<typeof getAdminDb>

export type ResolveListingTimezoneResult =
  | { ok: true; iana: string; source: 'zip5' | 'lat_lng' }
  | { ok: false; reason: 'no_timezone_candidates' | 'invalid_state' }

/** US ZIP5 from optional ZIP+4 or messy strings. */
export function extractUsZip5(zip: string | null | undefined): string | null {
  if (zip == null) return null
  const digits = String(zip).replace(/\D/g, '')
  if (digits.length < 5) return null
  return digits.slice(0, 5)
}

export function normalizeUsState2(state: string | null | undefined): string | null {
  if (state == null) return null
  const t = String(state).trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(t)) return null
  return t
}

/**
 * Resolve IANA timezone for a published sale using existing ingestion infra:
 * 1) ZIP5 + USPS state → `resolveIanaTimezoneForIngestionZip5` (DB zipcodes then npm `zipcodes`)
 * 2) Else lat/lng → vendored tz-lookup (same as ingestion)
 */
export async function resolveListingTimezoneForSale(
  admin: AdminDbForListingTz,
  args: {
    zipCode: string | null | undefined
    state: string | null | undefined
    lat: number
    lng: number
  }
): Promise<ResolveListingTimezoneResult> {
  const state2 = normalizeUsState2(args.state)
  const zip5 = extractUsZip5(args.zipCode)
  if (zip5 && state2) {
    const fromZip = await resolveIanaTimezoneForIngestionZip5(admin, { zip5, expectedState: state2 })
    if (fromZip) return { ok: true, iana: fromZip.iana, source: 'zip5' }
  }

  if (Number.isFinite(args.lat) && Number.isFinite(args.lng)) {
    const fromLatLng = resolveIanaTimezoneFromLatLng(args.lat, args.lng)
    if (fromLatLng) return { ok: true, iana: fromLatLng, source: 'lat_lng' }
  }

  if (args.state != null && String(args.state).trim() !== '' && !state2) {
    return { ok: false, reason: 'invalid_state' }
  }

  return { ok: false, reason: 'no_timezone_candidates' }
}
