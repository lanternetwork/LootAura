/**
 * Builds address + municipality inputs for geocode attempts without re-running
 * full ingest-time authority on the primary path. Arbitration (YSTM authority)
 * is reserved for the fallback attempt after a failed first pass.
 */

import { resolveYstmListingCityAuthority, getYstmPathMunicipalityPreview } from '@/lib/ingestion/ystmListingCityAuthority'
import { normalizeIngestionCity } from '@/lib/ingestion/normalizeIngestionLocation'

export type GeocodeAddressLineSource = 'address_raw' | 'normalized_address'

export type GeocodeMunicipalitySource =
  | 'listing_url'
  | 'row_city'
  | 'authority_resolved'
  | 'listing_url_metadata_guard'

function extractAddressSources(rawPayload: unknown): string[] {
  if (!rawPayload || typeof rawPayload !== 'object') return []
  const o = rawPayload as Record<string, unknown>
  const diag = o.ingestionDiagnostics
  if (diag && typeof diag === 'object' && Array.isArray((diag as { addressSources?: unknown }).addressSources)) {
    return (diag as { addressSources: string[] }).addressSources.filter((x) => typeof x === 'string')
  }
  const extracted = o.extractedFields
  if (extracted && typeof extracted === 'object') {
    const ing = (extracted as { ingestionDiagnostics?: unknown }).ingestionDiagnostics
    if (ing && typeof ing === 'object' && Array.isArray((ing as { addressSources?: unknown }).addressSources)) {
      return (ing as { addressSources: string[] }).addressSources.filter((x) => typeof x === 'string')
    }
  }
  return []
}

/**
 * Shared metadata (or metadata-only lines) must not drive primary municipality:
 * prefer listing URL path locality when YSTM and slug did not anchor the line.
 */
export function isMetadataOnlyAddressSource(rawPayload: unknown): boolean {
  const sources = extractAddressSources(rawPayload)
  if (sources.length === 0) return false
  const hasSlug =
    sources.includes('slug') ||
    sources.includes('slug_with_url_municipality') ||
    sources.includes('nearby')
  const hasMetadata = sources.includes('metadata')
  return hasMetadata && !hasSlug
}

export function streetLineForGeocodeAttempt(row: {
  address_raw: string | null
  normalized_address: string | null
}): { line: string; source: GeocodeAddressLineSource } {
  const raw = row.address_raw?.trim() || ''
  if (raw) {
    return { line: raw, source: 'address_raw' }
  }
  const norm = row.normalized_address?.trim() || ''
  return { line: norm, source: 'normalized_address' }
}

export type GeocodeAttemptPlan = {
  addressLine: string
  addressLineSource: GeocodeAddressLineSource
  state: string
  primaryCity: string
  primaryMunicipalitySource: GeocodeMunicipalitySource
  fallbackCity: string
  fallbackMunicipalitySource: GeocodeMunicipalitySource
}

export function buildGeocodeAttemptPlan(row: {
  address_raw: string | null
  normalized_address: string | null
  city: string | null
  state: string | null
  source_url?: string | null
  raw_payload?: unknown
}): GeocodeAttemptPlan {
  const { line: addressLine, source: addressLineSource } = streetLineForGeocodeAttempt(row)
  const state = row.state?.trim() || ''
  const rowCity = row.city?.trim() || ''
  const url = row.source_url?.trim() || ''
  const preview = url ? getYstmPathMunicipalityPreview(url) : { city: null as string | null, state: null as string | null }
  const metadataGuard = isMetadataOnlyAddressSource(row.raw_payload)

  let primaryCity = rowCity
  let primaryMunicipalitySource: GeocodeMunicipalitySource = 'row_city'

  if (metadataGuard && preview.city) {
    primaryCity = preview.city
    primaryMunicipalitySource = 'listing_url_metadata_guard'
  } else if (preview.city) {
    primaryCity = preview.city
    primaryMunicipalitySource = 'listing_url'
  }

  const auth =
    url && addressLine
      ? resolveYstmListingCityAuthority(url, addressLine)
      : null
  const resolved =
    normalizeIngestionCity(auth?.resolvedCity ?? null) ??
    (auth?.resolvedCity?.trim() || null)
  const fallbackCity = (resolved && resolved.length > 0 ? resolved : rowCity) || rowCity
  const fallbackMunicipalitySource: GeocodeMunicipalitySource =
    resolved && resolved.length > 0 ? 'authority_resolved' : 'row_city'

  return {
    addressLine,
    addressLineSource,
    state,
    primaryCity,
    primaryMunicipalitySource,
    fallbackCity,
    fallbackMunicipalitySource,
  }
}

export function primaryAndFallbackCitiesEquivalent(a: string, b: string): boolean {
  const na = normalizeIngestionCity(a.trim()) ?? a.trim().toLowerCase()
  const nb = normalizeIngestionCity(b.trim()) ?? b.trim().toLowerCase()
  return na === nb
}
