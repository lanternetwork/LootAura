import {
  calendarDaysBetweenUtc,
  DUPLICATE_GEO_MATCH_MAX_METERS,
  normalizeTitleForDedupe,
  titleOverlapPercent,
} from '@/lib/ingestion/duplicateScoring'
import { CRAWL_SKIP_DATE_TOLERANCE_DAYS } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import type {
  CrossProviderConvergenceCandidate,
  CrossProviderIngestDispositionInput,
  CrossProviderIngestDispositionResult,
  CrossProviderMatchConfidence,
  CrossProviderMatchMethod,
  CrossProviderShadowDisposition,
} from '@/lib/ingestion/identity/crossProviderDispositionTypes'

const MEDIUM_GEO_MAX_METERS = 1609

function platformsDiffer(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = a?.trim().toLowerCase() ?? ''
  const pb = b?.trim().toLowerCase() ?? ''
  return Boolean(pa && pb && pa !== pb)
}

function datesBeyondTolerance(aStart: string | null, bStart: string | null): boolean {
  if (!aStart?.trim() || !bStart?.trim()) return true
  return calendarDaysBetweenUtc(aStart.trim(), bStart.trim()) > CRAWL_SKIP_DATE_TOLERANCE_DAYS
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
  return calendarDaysBetweenUtc(aEndVal, bEndVal) <= CRAWL_SKIP_DATE_TOLERANCE_DAYS
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

function geoMeters(
  incoming: CrossProviderIngestDispositionInput,
  candidate: CrossProviderConvergenceCandidate
): number | null {
  if (
    incoming.lat == null ||
    incoming.lng == null ||
    candidate.lat == null ||
    candidate.lng == null ||
    !Number.isFinite(incoming.lat) ||
    !Number.isFinite(incoming.lng) ||
    !Number.isFinite(candidate.lat) ||
    !Number.isFinite(candidate.lng)
  ) {
    return null
  }
  return haversineMeters(incoming.lat, incoming.lng, candidate.lat, candidate.lng)
}

function addressesMatch(
  incomingAddress: string | null,
  candidateAddress: string | null
): boolean {
  const a = incomingAddress?.trim().toLowerCase() ?? ''
  const b = candidateAddress?.trim().toLowerCase() ?? ''
  return Boolean(a && b && a === b)
}

function canonicalKeysMatch(
  incomingKey: string | null,
  candidateKey: string | null
): boolean {
  const a = incomingKey?.trim() ?? ''
  const b = candidateKey?.trim() ?? ''
  return Boolean(a && b && a === b)
}

function selectPrimaryCandidate(
  candidates: readonly CrossProviderConvergenceCandidate[]
): CrossProviderConvergenceCandidate | null {
  const primaries = candidates
    .filter((c) => !c.is_duplicate)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
  return primaries[0] ?? candidates.slice().sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
}

function dispositionForConfidence(
  confidence: CrossProviderMatchConfidence
): CrossProviderShadowDisposition {
  switch (confidence) {
    case 'high':
      return 'would_link_observation'
    case 'medium':
      return 'would_suppress_publish'
    case 'ambiguous':
      return 'would_observation_review'
    default:
      return 'would_publish_distinct'
  }
}

function classifyCandidateMatch(
  input: CrossProviderIngestDispositionInput,
  candidate: CrossProviderConvergenceCandidate
): {
  confidence: CrossProviderMatchConfidence
  matchMethod: CrossProviderMatchMethod
  matchReasons: string[]
} {
  const reasons: string[] = []
  if (!platformsDiffer(input.incomingPlatform, candidate.source_platform)) {
    return { confidence: 'distinct', matchMethod: 'none', matchReasons: ['same_platform'] }
  }

  if (
    !dateWindowsOverlap(
      input.dateStart,
      input.dateEnd,
      candidate.date_start,
      candidate.date_end
    )
  ) {
    return { confidence: 'distinct', matchMethod: 'none', matchReasons: ['date_windows_no_overlap'] }
  }
  reasons.push('date_windows_overlap')

  const meters = geoMeters(input, candidate)
  const canonicalMatch = canonicalKeysMatch(
    input.incomingCanonicalKey,
    candidate.canonical_sale_instance_key
  )
  const addressMatch = addressesMatch(input.normalizedAddress, candidate.normalized_address)
  const titleOverlap = titleOverlapPercent(
    normalizeTitleForDedupe(input.normalizedTitle),
    normalizeTitleForDedupe(candidate.title)
  )

  if (canonicalMatch) {
    reasons.push('canonical_key_exact')
    if (meters != null && meters <= DUPLICATE_GEO_MATCH_MAX_METERS) {
      reasons.push('geo_within_120m')
      return { confidence: 'high', matchMethod: 'canonical_plus_geo', matchReasons: reasons }
    }
    if (addressMatch) {
      reasons.push('normalized_address_match')
      return { confidence: 'high', matchMethod: 'canonical_key_exact', matchReasons: reasons }
    }
    return { confidence: 'high', matchMethod: 'canonical_key_exact', matchReasons: reasons }
  }

  if (addressMatch && meters != null && meters <= DUPLICATE_GEO_MATCH_MAX_METERS) {
    reasons.push('normalized_address_match', 'geo_within_120m')
    return { confidence: 'high', matchMethod: 'address_plus_geo', matchReasons: reasons }
  }

  if (meters != null && meters <= DUPLICATE_GEO_MATCH_MAX_METERS && titleOverlap >= 40) {
    reasons.push('geo_within_120m', 'title_overlap_gte_40')
    return { confidence: 'high', matchMethod: 'geo_schedule_title', matchReasons: reasons }
  }

  if (meters != null && meters <= MEDIUM_GEO_MAX_METERS && titleOverlap >= 20) {
    reasons.push('geo_within_1mi', 'title_overlap_gte_20')
    return { confidence: 'medium', matchMethod: 'geo_schedule_title', matchReasons: reasons }
  }

  if (addressMatch && titleOverlap >= 15) {
    reasons.push('normalized_address_match', 'title_overlap_gte_15')
    return { confidence: 'medium', matchMethod: 'organizer_overlap', matchReasons: reasons }
  }

  if (addressMatch || (meters != null && meters <= MEDIUM_GEO_MAX_METERS)) {
    reasons.push('partial_overlap_weak_title')
    return { confidence: 'ambiguous', matchMethod: 'organizer_overlap', matchReasons: reasons }
  }

  return { confidence: 'distinct', matchMethod: 'none', matchReasons: ['insufficient_cross_provider_overlap'] }
}

function publishedCanonicalFalseNegative(
  input: CrossProviderIngestDispositionInput,
  candidates: readonly CrossProviderConvergenceCandidate[]
): {
  isFalseNegative: boolean
  matchedPublishedSaleId: string | null
  matchedIngestedSaleId: string | null
  matchedPlatform: string | null
  matchedCanonicalKey: string | null
} {
  const key = input.incomingCanonicalKey?.trim()
  if (!key) {
    return {
      isFalseNegative: false,
      matchedPublishedSaleId: null,
      matchedIngestedSaleId: null,
      matchedPlatform: null,
      matchedCanonicalKey: null,
    }
  }

  for (const row of candidates) {
    if (!platformsDiffer(input.incomingPlatform, row.source_platform)) continue
    if (!canonicalKeysMatch(key, row.canonical_sale_instance_key)) continue
    const published = row.published_sale_id?.trim()
    if (!published) continue
    return {
      isFalseNegative: true,
      matchedPublishedSaleId: published,
      matchedIngestedSaleId: row.id,
      matchedPlatform: row.source_platform,
      matchedCanonicalKey: row.canonical_sale_instance_key,
    }
  }

  return {
    isFalseNegative: false,
    matchedPublishedSaleId: null,
    matchedIngestedSaleId: null,
    matchedPlatform: null,
    matchedCanonicalKey: null,
  }
}

/**
 * Phase B: deterministic cross-provider convergence disposition (shadow only — no writes).
 */
export function resolveCrossProviderIngestDisposition(
  input: CrossProviderIngestDispositionInput
): CrossProviderIngestDispositionResult {
  const crossPlatform = input.candidates.filter((c) =>
    platformsDiffer(input.incomingPlatform, c.source_platform)
  )

  const falseNegativeProbe = publishedCanonicalFalseNegative(input, input.candidates)

  if (crossPlatform.length === 0) {
    const disposition: CrossProviderShadowDisposition = 'would_publish_distinct'
    return {
      confidence: 'distinct',
      disposition,
      matchMethod: 'none',
      matchReasons: ['no_cross_platform_candidates'],
      primaryIngestedSaleId: null,
      matchedIngestedSaleId: falseNegativeProbe.matchedIngestedSaleId,
      matchedPlatform: falseNegativeProbe.matchedPlatform,
      matchedCanonicalKey: falseNegativeProbe.matchedCanonicalKey,
      matchedPublishedSaleId: falseNegativeProbe.matchedPublishedSaleId,
      isFalseNegative:
        disposition === 'would_publish_distinct' && falseNegativeProbe.isFalseNegative,
    }
  }

  let best: {
    confidence: CrossProviderMatchConfidence
    matchMethod: CrossProviderMatchMethod
    matchReasons: string[]
    candidate: CrossProviderConvergenceCandidate
  } | null = null

  const rank: Record<CrossProviderMatchConfidence, number> = {
    high: 3,
    medium: 2,
    ambiguous: 1,
    distinct: 0,
  }

  for (const candidate of crossPlatform) {
    const scored = classifyCandidateMatch(input, candidate)
    if (!best || rank[scored.confidence] > rank[best.confidence]) {
      best = { ...scored, candidate }
    } else if (best && rank[scored.confidence] === rank[best.confidence]) {
      if (candidate.id.localeCompare(best.candidate.id) < 0) {
        best = { ...scored, candidate }
      }
    }
  }

  const primary = selectPrimaryCandidate(crossPlatform)
  const confidence = best?.confidence ?? 'distinct'
  const disposition = dispositionForConfidence(confidence)

  return {
    confidence,
    disposition,
    matchMethod: best?.matchMethod ?? 'none',
    matchReasons: best?.matchReasons ?? ['no_scored_cross_platform_match'],
    primaryIngestedSaleId: primary?.id ?? null,
    matchedIngestedSaleId: best?.candidate.id ?? falseNegativeProbe.matchedIngestedSaleId,
    matchedPlatform: best?.candidate.source_platform ?? falseNegativeProbe.matchedPlatform,
    matchedCanonicalKey:
      best?.candidate.canonical_sale_instance_key ?? falseNegativeProbe.matchedCanonicalKey,
    matchedPublishedSaleId:
      best?.candidate.published_sale_id?.trim() || falseNegativeProbe.matchedPublishedSaleId,
    isFalseNegative: disposition === 'would_publish_distinct' && falseNegativeProbe.isFalseNegative,
  }
}
