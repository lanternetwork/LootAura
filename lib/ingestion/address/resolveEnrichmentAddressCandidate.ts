import { parseSeeSourceUnlockAtFromListingUrl } from '@/lib/ingestion/address/addressGated'
import {
  addressLineFromYstmListingUrlSlug,
  enrichStreetLineWithPathMunicipalityWhenNoTail,
} from '@/lib/ingestion/ystmAddressSlug'
import { isAddressGeocodeReady, normalizeAddressLineForIngest } from '@/lib/ingestion/address/addressUsability'

export type EnrichmentAddressResolutionSource = 'detail_page' | 'url_slug_after_unlock'

export type EnrichmentAddressResolution = {
  addressRaw: string | null
  source: EnrichmentAddressResolutionSource | null
}

function unlockStillInFuture(sourceUrl: string, nowMs: number): boolean {
  const unlockAt = parseSeeSourceUnlockAtFromListingUrl(sourceUrl)
  return unlockAt != null && unlockAt.getTime() > nowMs
}

/**
 * Resolve a geocode-ready address for enrichment after detail HTML parse.
 * When unlock has passed, retry URL slug recovery (detail-first may have native coords only).
 */
export function resolveEnrichmentAddressCandidate(input: {
  detailPageAddressRaw: string | null | undefined
  sourceUrl: string
  nowMs: number
}): EnrichmentAddressResolution {
  let addressRaw = normalizeAddressLineForIngest(input.detailPageAddressRaw)
  if (addressRaw) {
    const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(addressRaw, input.sourceUrl)
    addressRaw = enriched.line
    if (isAddressGeocodeReady(addressRaw)) {
      return { addressRaw, source: 'detail_page' }
    }
  }

  if (unlockStillInFuture(input.sourceUrl, input.nowMs)) {
    return { addressRaw: null, source: null }
  }

  const slugLine = addressLineFromYstmListingUrlSlug(input.sourceUrl)
  if (slugLine) {
    const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(slugLine, input.sourceUrl)
    const candidate = enriched.line
    if (isAddressGeocodeReady(candidate)) {
      return { addressRaw: candidate, source: 'url_slug_after_unlock' }
    }
  }

  return { addressRaw: addressRaw ?? null, source: null }
}

export function isUnlockScheduledInFuture(input: {
  sourceUrl: string
  addressUnlockAt: string | null | undefined
  nowMs: number
}): boolean {
  const unlockAtFromRow = input.addressUnlockAt ? Date.parse(input.addressUnlockAt) : NaN
  if (Number.isFinite(unlockAtFromRow) && unlockAtFromRow > input.nowMs) {
    return true
  }
  return unlockStillInFuture(input.sourceUrl, input.nowMs)
}
