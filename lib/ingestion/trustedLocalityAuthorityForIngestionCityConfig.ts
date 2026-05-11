import { normalizeIngestionCity, normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'
import { resolveYstmListingCityAuthority } from '@/lib/ingestion/ystmListingCityAuthority'
import { extractZip5ForIngestionContext } from '@/lib/ingestion/extractZip5ForIngestion'
import { resolveZipLocalityPrimaryWithDiagnostics } from '@/lib/ingestion/zipLocalityPrimaryAuthority'

export type IngestionCityConfigLocalityAuthoritySource =
  | 'forwarded_communitysale_payload'
  | 'ystm_listing_url'
  | 'ystm_address_tail'
  | 'zip_locality_primary'

const TRUSTED_FORWARDED_SOURCES = new Set([
  'zip_locality_authority',
  'page_canonical_ystm_url',
  'address_tail',
  'metadata_sale_address',
])

function readForwardedCommunityAuthority(raw: unknown): { source: string; city: string; state: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const block = o.communitysaleLocalityAuthority ?? o.communitiesaleLocalityAuthority
  if (!block || typeof block !== 'object') return null
  const b = block as Record<string, unknown>
  const source = typeof b.source === 'string' ? b.source : null
  const city = typeof b.city === 'string' ? b.city : null
  const state = typeof b.state === 'string' ? b.state : null
  if (!source || !city || !state) return null
  return { source, city, state }
}

/**
 * Gate for auto-provisioning `ingestion_city_configs` from a validated locality.
 * Does not use title/description prose; rejects URL/path–address conflicts and ambiguous ZIP.
 */
export function evaluateTrustedLocalityAuthorityForIngestionCityConfig(args: {
  sourceUrl: string
  resolvedAddressRaw: string | null | undefined
  processedCity: string | null | undefined
  processedState: string | null | undefined
  rawPayload: unknown
}):
  | { trusted: true; source: IngestionCityConfigLocalityAuthoritySource }
  | { trusted: false; reason: string } {
  const city = normalizeIngestionCity(args.processedCity)
  const state = normalizeIngestionState(args.processedState)
  if (!city || !state) {
    return { trusted: false, reason: 'missing_processed_city_or_state' }
  }

  const forwarded = readForwardedCommunityAuthority(args.rawPayload)
  if (forwarded && TRUSTED_FORWARDED_SOURCES.has(forwarded.source)) {
    if (
      normalizeIngestionCity(forwarded.city) === city &&
      normalizeIngestionState(forwarded.state) === state
    ) {
      return { trusted: true, source: 'forwarded_communitysale_payload' }
    }
    return { trusted: false, reason: 'forwarded_communitysale_payload_mismatch' }
  }

  const auth = resolveYstmListingCityAuthority(args.sourceUrl, args.resolvedAddressRaw ?? null)
  if (auth.cityConflict) {
    return { trusted: false, reason: 'city_conflict' }
  }

  if (auth.citySource === 'listing_url' || auth.stateSource === 'listing_url') {
    if (
      normalizeIngestionCity(auth.resolvedCity) === city &&
      normalizeIngestionState(auth.resolvedState) === state
    ) {
      return { trusted: true, source: 'ystm_listing_url' }
    }
    return { trusted: false, reason: 'ystm_listing_url_mismatch' }
  }

  if (auth.citySource === 'address_tail' || auth.stateSource === 'address_tail') {
    if (
      normalizeIngestionCity(auth.addressTailCity) === city &&
      normalizeIngestionState(auth.addressTailState) === state
    ) {
      return { trusted: true, source: 'ystm_address_tail' }
    }
    return { trusted: false, reason: 'ystm_address_tail_mismatch' }
  }

  const zip5 = extractZip5ForIngestionContext({
    resolvedAddressRaw: args.resolvedAddressRaw ?? null,
    sourceUrl: args.sourceUrl,
  })
  if (!zip5) {
    return { trusted: false, reason: 'missing_zip_for_locality_trust' }
  }

  const zipDiag = resolveZipLocalityPrimaryWithDiagnostics({ zip: zip5, expectedState: state })
  if (zipDiag.rejectionReason || !zipDiag.result) {
    return { trusted: false, reason: `zip_locality_${zipDiag.rejectionReason ?? 'rejected'}` }
  }

  if (
    normalizeIngestionCity(zipDiag.result.city) === city &&
    normalizeIngestionState(zipDiag.result.state) === state
  ) {
    return { trusted: true, source: 'zip_locality_primary' }
  }

  return { trusted: false, reason: 'zip_locality_mismatch' }
}
