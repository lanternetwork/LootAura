import type { ExternalPageSourceListing } from '@/lib/ingestion/adapters/externalPageSource'
import type { DetailFirstFieldProvenance } from '@/lib/ingestion/acquisition/detailFirstFieldProvenance'
import type { YstmDetailFirstFallbackReason } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import {
  InsufficientAddressForPublishError,
  validateResolvedAddressForPublish,
} from '@/lib/ingestion/publishValidation'
import {
  coerceIngestedDateToYyyyMmDd,
  isSaleWindowExpiredAtDiscovery,
} from '@/lib/ingestion/saleWindowDates'

export type DetailEnrichedValidationResult =
  | {
      ok: true
      city: string
      state: string
      normalizedLine: string
      normalizedPublish: string
    }
  | { ok: false; reason: YstmDetailFirstFallbackReason }

function classifyAddressPublishFailure(
  normalizedPublish: string,
  city: string,
  state: string
): YstmDetailFirstFallbackReason {
  try {
    validateResolvedAddressForPublish(normalizedPublish, city, state)
    return 'address_validation_failed'
  } catch (err) {
    if (err instanceof InsufficientAddressForPublishError) {
      const msg = err.message.toLowerCase()
      if (msg.includes('lacks a resolvable street') || msg.includes('street detail required')) {
        return 'missing_street_number'
      }
    }
    return 'address_validation_failed'
  }
}

function hasValidDatetime(start: unknown, end: unknown): boolean {
  return coerceIngestedDateToYyyyMmDd(start) != null || coerceIngestedDateToYyyyMmDd(end) != null
}

/**
 * Validate the detail-enriched listing (post-fetch merge), never the list seed alone.
 */
export function validateDetailEnrichedListing(
  listing: ExternalPageSourceListing,
  _provenance: DetailFirstFieldProvenance
): DetailEnrichedValidationResult {
  if (isSaleWindowExpiredAtDiscovery(listing.startDate, listing.endDate)) {
    return { ok: false, reason: 'expired_after_detail' }
  }

  if (!listing.title?.trim()) {
    return { ok: false, reason: 'missing_title' }
  }

  if (!hasValidDatetime(listing.startDate, listing.endDate)) {
    return { ok: false, reason: 'invalid_dates' }
  }

  const city = listing.city?.trim() ?? ''
  const state = listing.state?.trim() ?? ''
  if (!city || !state || !isAddressGeocodeReady(listing.addressRaw)) {
    return { ok: false, reason: 'address_validation_failed' }
  }

  const normalizedLine = listing.addressRaw!.toLowerCase().replace(/\s+/g, ' ')
  const normalizedPublish = normalizeAddressForPublish(normalizedLine, city, state)
  if (!normalizedPublish) {
    return { ok: false, reason: 'address_validation_failed' }
  }

  try {
    validateResolvedAddressForPublish(normalizedPublish, city, state)
  } catch {
    return {
      ok: false,
      reason: classifyAddressPublishFailure(normalizedPublish, city, state),
    }
  }

  return { ok: true, city, state, normalizedLine, normalizedPublish }
}

export function detailFirstValidationTelemetry(
  listSeed: ExternalPageSourceListing,
  listing: ExternalPageSourceListing,
  provenance: DetailFirstFieldProvenance
): Record<string, unknown> {
  return {
    detailFirstAddressFromDetailPage: provenance.addressRaw === 'detail_page',
    detailFirstTitleFromDetailPage: provenance.title === 'detail_page',
    detailFirstDatesFromDetailPage:
      provenance.startDate === 'detail_page' || provenance.endDate === 'detail_page',
    listSeedAddressRaw: listSeed.addressRaw ?? null,
    validatedAddressRaw: listing.addressRaw ?? null,
  }
}
