import { CRAWL_SKIP_DATE_TOLERANCE_DAYS } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import { isIngestedRowExpiredForDuplicate } from '@/lib/ingestion/acquisition/ingestedRowExpired'
import {
  calendarDaysBetweenUtc,
  DUPLICATE_GEO_MATCH_MAX_METERS,
  type SoftDuplicateCandidateRow,
} from '@/lib/ingestion/duplicateScoring'
import {
  computeSourceLocationHash,
  normalizeLocationBucket,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { extractYstmSourceListingId } from '@/lib/ingestion/identity/ystmSourceListingId'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'

export type SoftDedupeSafetyIncoming = {
  dateStart: string | null
  dateEnd: string | null
  sourceUrl: string
  externalId: string | null
  state: string | null
  city: string | null
  normalizedAddress: string | null
  lat: number | null
  lng: number | null
  sourcePlatform?: string | null
  saleInstanceKey?: string | null
  sourceLocationHash?: string | null
  canonicalSaleInstanceKey?: string | null
}

export type SoftDedupeSafetyCandidate = SoftDuplicateCandidateRow & {
  sale_instance_key?: string | null
  source_listing_id?: string | null
  status?: string | null
  failure_reasons?: unknown
  source_location_hash?: string | null
  canonical_sale_instance_key?: string | null
}

function platformsDiffer(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = a?.trim().toLowerCase() ?? ''
  const pb = b?.trim().toLowerCase() ?? ''
  return Boolean(pa && pb && pa !== pb)
}

function canonicalKeysMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = a?.trim() ?? ''
  const kb = b?.trim() ?? ''
  return Boolean(ka && kb && ka === kb)
}

export type SoftDedupeSuppressionSafetyResult = {
  allowSuppress: boolean
  blockedReasons: string[]
}

function datesBeyondTolerance(
  incomingStart: string | null,
  existingStart: string | null
): boolean {
  if (!incomingStart?.trim() || !existingStart?.trim()) return false
  return (
    calendarDaysBetweenUtc(incomingStart.trim(), existingStart.trim()) >
    CRAWL_SKIP_DATE_TOLERANCE_DAYS
  )
}

function dateWindowsOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  if (!aStart?.trim() || !bStart?.trim()) return false
  if (datesBeyondTolerance(aStart, bStart)) return false
  const aEndVal = aEnd?.trim() || aStart
  const bEndVal = bEnd?.trim() || bStart
  const endDelta = calendarDaysBetweenUtc(aEndVal, bEndVal)
  return endDelta <= CRAWL_SKIP_DATE_TOLERANCE_DAYS
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function hasValidNativeCoords(incoming: SoftDedupeSafetyIncoming): boolean {
  return (
    incoming.lat != null &&
    incoming.lng != null &&
    Number.isFinite(incoming.lat) &&
    Number.isFinite(incoming.lng)
  )
}

function resolveIncomingListingId(incoming: SoftDedupeSafetyIncoming): string | null {
  if (isYstmDetailListingUrl(incoming.sourceUrl)) {
    return extractYstmSourceListingId(incoming.sourceUrl)
  }
  return incoming.externalId?.trim() || null
}

function resolveCandidateListingId(candidate: SoftDedupeSafetyCandidate): string | null {
  if (candidate.source_listing_id?.trim()) return candidate.source_listing_id.trim()
  const url = candidate.source_url ?? candidate.canonical_source_url
  if (url && isYstmDetailListingUrl(url)) return extractYstmSourceListingId(url)
  return candidate.external_id?.trim() || null
}

function coordinateBucketsDifferMaterially(
  incoming: SoftDedupeSafetyIncoming,
  winner: SoftDedupeSafetyCandidate
): boolean {
  if (
    incoming.sourceLocationHash?.trim() &&
    winner.source_location_hash?.trim() &&
    incoming.sourceLocationHash.trim() !== winner.source_location_hash.trim()
  ) {
    return true
  }

  const incHasCoords = hasValidNativeCoords(incoming)
  const winHasCoords =
    winner.lat != null &&
    winner.lng != null &&
    Number.isFinite(winner.lat) &&
    Number.isFinite(winner.lng)

  if (incHasCoords && winHasCoords) {
    const meters = haversineMeters(incoming.lat!, incoming.lng!, winner.lat!, winner.lng!)
    if (meters > DUPLICATE_GEO_MATCH_MAX_METERS) return true
  }

  if (incHasCoords && winHasCoords) return false

  const incomingHash = computeSourceLocationHash({
    state: incoming.state,
    city: incoming.city,
    normalizedAddress: incoming.normalizedAddress,
    lat: incoming.lat,
    lng: incoming.lng,
  })
  const winnerHash =
    winner.source_location_hash?.trim() ||
    computeSourceLocationHash({
      state: incoming.state,
      city: incoming.city,
      normalizedAddress: incoming.normalizedAddress,
      lat: winner.lat,
      lng: winner.lng,
    })
  if (incomingHash !== winnerHash) {
    const incomingBucket = normalizeLocationBucket({
      state: incoming.state,
      city: incoming.city,
      normalizedAddress: incoming.normalizedAddress,
    })
    const winnerBucket = normalizeLocationBucket({
      state: incoming.state,
      city: incoming.city,
      normalizedAddress: incoming.normalizedAddress,
    })
    if (incomingBucket !== winnerBucket) return true
  }

  return false
}

/**
 * Phase 8: block weak soft-dedupe suppressions when identity/date/geo signals disagree.
 */
export function evaluateSoftDedupeSuppressionSafety(
  incoming: SoftDedupeSafetyIncoming,
  winner: SoftDedupeSafetyCandidate
): SoftDedupeSuppressionSafetyResult {
  const blockedReasons: string[] = []

  if (datesBeyondTolerance(incoming.dateStart, winner.date_start)) {
    blockedReasons.push('date_start_beyond_3_day_tolerance')
  }

  if (
    !dateWindowsOverlap(
      incoming.dateStart,
      incoming.dateEnd,
      winner.date_start,
      winner.date_end
    )
  ) {
    blockedReasons.push('date_windows_no_overlap')
  }

  const incListingId = resolveIncomingListingId(incoming)
  const winListingId = resolveCandidateListingId(winner)
  if (incListingId && winListingId && incListingId !== winListingId) {
    blockedReasons.push('source_listing_id_materially_different')
  }

  const crossProviderCanonicalConvergence =
    platformsDiffer(incoming.sourcePlatform, winner.source_platform) &&
    canonicalKeysMatch(
      incoming.canonicalSaleInstanceKey,
      winner.canonical_sale_instance_key
    )

  if (
    !crossProviderCanonicalConvergence &&
    incoming.saleInstanceKey?.trim() &&
    winner.sale_instance_key?.trim() &&
    incoming.saleInstanceKey.trim() !== winner.sale_instance_key.trim()
  ) {
    blockedReasons.push('sale_instance_key_mismatch')
  }

  if (coordinateBucketsDifferMaterially(incoming, winner)) {
    blockedReasons.push('coordinate_bucket_materially_different')
  }

  if (
    hasValidNativeCoords(incoming) &&
    isIngestedRowExpiredForDuplicate(winner.status ?? '', winner.failure_reasons)
  ) {
    blockedReasons.push('expired_winner_valid_incoming_coords')
  }

  return {
    allowSuppress: blockedReasons.length === 0,
    blockedReasons,
  }
}

export function buildSoftDedupeSuppressionReason(
  evaluationConfidence: string,
  skipKind: string | null
): string {
  const kind = skipKind ?? 'duplicate_cross_city_page'
  return `${kind}:${evaluationConfidence}`
}
