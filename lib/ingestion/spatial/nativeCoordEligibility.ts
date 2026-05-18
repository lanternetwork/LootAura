import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'

/** Mirrors `lootaura_v2.is_native_coord_needs_check_eligible` (transient geocode dead-letter only). */
export function isNativeCoordNeedsCheckEligible(failureDetails: unknown): boolean {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) {
    return false
  }
  const dl = (failureDetails as Record<string, unknown>).geocode_dead_letter
  if (!dl || typeof dl !== 'object' || Array.isArray(dl)) return false
  const section = dl as Record<string, unknown>
  if (section.disposition !== 'retryable') return false
  if (section.eligible_replay !== true) return false
  const reasons = section.reasons
  if (!Array.isArray(reasons)) return false
  return reasons.includes('transient_provider')
}

export function isPublishableAddressForNativeRemediation(
  addressRaw: string | null | undefined,
  city: string,
  state: string
): boolean {
  if (!isAddressGeocodeReady(addressRaw)) return false
  const normalized = normalizeAddressForPublish(addressRaw ?? null, city, state)
  if (!normalized) return false
  try {
    validateResolvedAddressForPublish(normalized, city, state)
    return true
  } catch {
    return false
  }
}

export function isYstmNativeRemediationCandidate(params: {
  sourcePlatform: string | null | undefined
  sourceUrl: string | null | undefined
  status: string
  lat: number | null | undefined
  lng: number | null | undefined
  addressStatus: string | null | undefined
  publishedSaleId: string | null | undefined
  failureDetails?: unknown
}): boolean {
  if (params.sourcePlatform !== 'external_page_source') return false
  if (!isYstmDetailListingUrl(params.sourceUrl)) return false
  if (params.lat != null || params.lng != null) return false
  if (params.publishedSaleId != null) return false
  if (params.addressStatus !== 'address_available') return false
  if (params.status === 'needs_geocode') return true
  if (params.status === 'needs_check') {
    return isNativeCoordNeedsCheckEligible(params.failureDetails)
  }
  return false
}

export const MAX_NATIVE_COORD_REMEDIATION_ATTEMPTS = 5 as const

export function isTerminalNativeCoordFailureReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.startsWith('terminal_')
}

/** YSTM detail rows still on the native remediation path (geocode should not claim). */
export function ystmRowAwaitingNativeRemediation(params: {
  sourcePlatform: string | null | undefined
  sourceUrl: string | null | undefined
  lat: number | null | undefined
  lng: number | null | undefined
  nativeCoordAttempts: number | null | undefined
  nativeCoordFailureReason: string | null | undefined
}): boolean {
  if (params.sourcePlatform !== 'external_page_source') return false
  if (!isYstmDetailListingUrl(params.sourceUrl)) return false
  if (params.lat != null || params.lng != null) return false
  if (isTerminalNativeCoordFailureReason(params.nativeCoordFailureReason)) return false
  const attempts = params.nativeCoordAttempts ?? 0
  return attempts < MAX_NATIVE_COORD_REMEDIATION_ATTEMPTS
}
