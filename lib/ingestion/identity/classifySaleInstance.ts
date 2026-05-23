import { CRAWL_SKIP_DATE_TOLERANCE_DAYS } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import { isIngestedRowExpiredForDuplicate } from '@/lib/ingestion/acquisition/ingestedRowExpired'
import {
  computeYstmSaleInstanceIdentity,
  normalizeLocationBucket,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import type {
  ComputeYstmSaleInstanceIdentityInput,
  SaleInstanceIdentityFields,
} from '@/lib/ingestion/identity/saleInstanceIdentityTypes'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { calendarDaysBetweenUtc } from '@/lib/ingestion/duplicateScoring'
import { isSaleWindowExpiredAtDiscovery } from '@/lib/ingestion/saleWindowDates'

export const SALE_INSTANCE_DECISIONS = [
  'same_event_no_change',
  'same_event_updated',
  'new_event_same_url',
  'new_event_new_url',
  'stale_event_expired',
  'invalid_event',
  'ambiguous_requires_review',
] as const

export type SaleInstanceDecision = (typeof SALE_INSTANCE_DECISIONS)[number]

export type SaleInstanceClassificationConfidence = 'high' | 'medium' | 'low'

export type ExistingIngestedSaleCandidate = {
  id: string
  source_url?: string | null
  source_listing_id?: string | null
  sale_instance_key?: string | null
  source_content_hash?: string | null
  source_schedule_hash?: string | null
  source_location_hash?: string | null
  date_start?: string | null
  date_end?: string | null
  normalized_address?: string | null
  lat?: number | null
  lng?: number | null
  status?: string | null
  failure_reasons?: unknown
  superseded_by_ingested_sale_id?: string | null
}

export type ClassifySaleInstanceInput = {
  sourcePlatform: string
  sourceUrl: string
  canonicalSourceUrl?: string
  state: string | null
  city: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  timeStart?: string | null
  timeEnd?: string | null
  title?: string | null
  description?: string | null
  imageSourceUrl?: string | null
  lat?: number | null
  lng?: number | null
  rawPayload?: Record<string, unknown> | null
  identity?: SaleInstanceIdentityFields | null
  existingRowsBySourceUrl: ExistingIngestedSaleCandidate[]
  existingRowsBySaleInstanceKey: ExistingIngestedSaleCandidate[]
  existingRowsByAddressDate: ExistingIngestedSaleCandidate[]
  seenAtIso?: string
}

export type ClassifySaleInstanceResult = {
  decision: SaleInstanceDecision
  saleInstanceKey: string | null
  matchedIngestedSaleId: string | null
  supersedesIngestedSaleId: string | null
  confidence: SaleInstanceClassificationConfidence
  reasons: string[]
  hashes: {
    source_content_hash: string | null
    source_schedule_hash: string | null
    source_location_hash: string | null
    source_payload_hash: string | null
  }
}

function normalizeAddressLine(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
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

function buildIdentityInput(input: ClassifySaleInstanceInput): ComputeYstmSaleInstanceIdentityInput {
  return {
    sourcePlatform: input.sourcePlatform,
    sourceUrl: input.sourceUrl,
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    timeStart: input.timeStart,
    timeEnd: input.timeEnd,
    title: input.title,
    description: input.description,
    imageSourceUrl: input.imageSourceUrl,
    lat: input.lat,
    lng: input.lng,
    rawPayload: input.rawPayload,
    seenAtIso: input.seenAtIso,
  }
}

function resultHashes(identity: SaleInstanceIdentityFields | null): ClassifySaleInstanceResult['hashes'] {
  return {
    source_content_hash: identity?.source_content_hash ?? null,
    source_schedule_hash: identity?.source_schedule_hash ?? null,
    source_location_hash: identity?.source_location_hash ?? null,
    source_payload_hash: identity?.source_payload_hash ?? null,
  }
}

function baseResult(
  partial: Omit<ClassifySaleInstanceResult, 'hashes'> & { identity: SaleInstanceIdentityFields | null }
): ClassifySaleInstanceResult {
  return {
    decision: partial.decision,
    saleInstanceKey: partial.saleInstanceKey,
    matchedIngestedSaleId: partial.matchedIngestedSaleId,
    supersedesIngestedSaleId: partial.supersedesIngestedSaleId,
    confidence: partial.confidence,
    reasons: partial.reasons,
    hashes: resultHashes(partial.identity),
  }
}

function isActiveCandidate(row: ExistingIngestedSaleCandidate): boolean {
  if (row.superseded_by_ingested_sale_id) return false
  if (isIngestedRowExpiredForDuplicate(row.status ?? '', row.failure_reasons)) return false
  return true
}

function contentUnchanged(
  identity: SaleInstanceIdentityFields | null,
  existing: ExistingIngestedSaleCandidate
): boolean {
  if (!identity?.source_content_hash || !existing.source_content_hash) return false
  return identity.source_content_hash === existing.source_content_hash
}

function classifySameKeyMatch(
  identity: SaleInstanceIdentityFields,
  existing: ExistingIngestedSaleCandidate,
  sameUrl: boolean
): ClassifySaleInstanceResult {
  if (contentUnchanged(identity, existing)) {
    return baseResult({
      decision: 'same_event_no_change',
      saleInstanceKey: identity.sale_instance_key,
      matchedIngestedSaleId: existing.id,
      supersedesIngestedSaleId: null,
      confidence: 'high',
      reasons: ['sale_instance_key_match', 'content_hash_unchanged'],
      identity,
    })
  }

  return baseResult({
    decision: 'same_event_updated',
    saleInstanceKey: identity.sale_instance_key,
    matchedIngestedSaleId: existing.id,
    supersedesIngestedSaleId: null,
    confidence: 'high',
    reasons: [
      'sale_instance_key_match',
      sameUrl ? 'source_url_history' : 'sale_instance_key_index',
    ],
    identity,
  })
}

function classifyNewEventSameUrl(
  identity: SaleInstanceIdentityFields | null,
  existing: ExistingIngestedSaleCandidate,
  reasons: string[]
): ClassifySaleInstanceResult {
  return baseResult({
    decision: 'new_event_same_url',
    saleInstanceKey: identity?.sale_instance_key ?? null,
    matchedIngestedSaleId: existing.id,
    supersedesIngestedSaleId: existing.id,
    confidence: 'high',
    reasons,
    identity,
  })
}

function classifyAgainstUrlRow(
  input: ClassifySaleInstanceInput,
  identity: SaleInstanceIdentityFields | null,
  existing: ExistingIngestedSaleCandidate
): ClassifySaleInstanceResult {
  const reasons: string[] = ['source_url_history']

  const existingExpired = isIngestedRowExpiredForDuplicate(
    existing.status ?? '',
    existing.failure_reasons
  )
  const listingExpired = isSaleWindowExpiredAtDiscovery(input.dateStart, input.dateEnd)

  if (existingExpired && !listingExpired) {
    return classifyNewEventSameUrl(identity, existing, [
      ...reasons,
      'prior_row_expired',
      'listing_active',
    ])
  }

  if (existingExpired && listingExpired) {
    return baseResult({
      decision: 'stale_event_expired',
      saleInstanceKey: identity?.sale_instance_key ?? null,
      matchedIngestedSaleId: existing.id,
      supersedesIngestedSaleId: null,
      confidence: 'medium',
      reasons: [...reasons, 'prior_row_expired', 'listing_expired'],
      identity,
    })
  }

  const incomingKey = identity?.sale_instance_key ?? null
  const existingKey = existing.sale_instance_key?.trim() || null

  if (incomingKey && existingKey) {
    if (incomingKey === existingKey) {
      return classifySameKeyMatch(identity!, existing, true)
    }
    return classifyNewEventSameUrl(identity, existing, [
      ...reasons,
      'sale_instance_key_mismatch',
    ])
  }

  if (
    identity?.source_listing_id &&
    existing.source_listing_id &&
    identity.source_listing_id === existing.source_listing_id &&
    dateWindowsOverlap(input.dateStart, input.dateEnd, existing.date_start ?? null, existing.date_end ?? null)
  ) {
    return classifySameKeyMatch(identity, existing, true)
  }

  const incomingAddr = normalizeAddressLine(input.normalizedAddress)
  const existingAddr = normalizeAddressLine(existing.normalized_address)
  if (
    incomingAddr &&
    existingAddr &&
    incomingAddr === existingAddr &&
    dateWindowsOverlap(input.dateStart, input.dateEnd, existing.date_start ?? null, existing.date_end ?? null)
  ) {
    return baseResult({
      decision: 'same_event_updated',
      saleInstanceKey: identity?.sale_instance_key ?? null,
      matchedIngestedSaleId: existing.id,
      supersedesIngestedSaleId: null,
      confidence: 'medium',
      reasons: [...reasons, 'address_date_overlap'],
      identity,
    })
  }

  if (datesBeyondTolerance(input.dateStart, existing.date_start ?? null)) {
    return classifyNewEventSameUrl(identity, existing, [...reasons, 'dates_beyond_tolerance'])
  }

  if (incomingAddr && existingAddr && incomingAddr !== existingAddr) {
    return classifyNewEventSameUrl(identity, existing, [...reasons, 'location_changed'])
  }

  if (input.dateStart?.trim() && existing.date_start?.trim()) {
    return baseResult({
      decision: 'same_event_updated',
      saleInstanceKey: identity?.sale_instance_key ?? null,
      matchedIngestedSaleId: existing.id,
      supersedesIngestedSaleId: null,
      confidence: 'medium',
      reasons: [...reasons, 'dates_within_tolerance'],
      identity,
    })
  }

  return baseResult({
    decision: 'ambiguous_requires_review',
    saleInstanceKey: identity?.sale_instance_key ?? null,
    matchedIngestedSaleId: existing.id,
    supersedesIngestedSaleId: null,
    confidence: 'low',
    reasons: [...reasons, 'insufficient_match_signals'],
    identity,
  })
}

function dedupeCandidates(rows: ExistingIngestedSaleCandidate[]): ExistingIngestedSaleCandidate[] {
  const seen = new Set<string>()
  const out: ExistingIngestedSaleCandidate[] = []
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

/**
 * Phase 6: authoritative sale-instance classification (identity-first, not URL-only).
 */
export function classifySaleInstance(input: ClassifySaleInstanceInput): ClassifySaleInstanceResult {
  if (!isYstmDetailListingUrl(input.sourceUrl)) {
    return baseResult({
      decision: 'invalid_event',
      saleInstanceKey: null,
      matchedIngestedSaleId: null,
      supersedesIngestedSaleId: null,
      confidence: 'high',
      reasons: ['non_ystm_detail_url'],
      identity: null,
    })
  }

  const identity = input.identity ?? computeYstmSaleInstanceIdentity(buildIdentityInput(input))

  if (isSaleWindowExpiredAtDiscovery(input.dateStart, input.dateEnd)) {
    return baseResult({
      decision: 'stale_event_expired',
      saleInstanceKey: identity?.sale_instance_key ?? null,
      matchedIngestedSaleId: null,
      supersedesIngestedSaleId: null,
      confidence: 'high',
      reasons: ['listing_expired_at_discovery'],
      identity,
    })
  }

  const key = identity?.sale_instance_key ?? null

  for (const row of dedupeCandidates(input.existingRowsBySaleInstanceKey)) {
    if (!isActiveCandidate(row)) continue
    if (key && row.sale_instance_key === key && identity) {
      return classifySameKeyMatch(identity, row, row.source_url === input.sourceUrl)
    }
  }

  for (const row of dedupeCandidates(input.existingRowsByAddressDate)) {
    if (!isActiveCandidate(row)) continue
    if (!identity?.source_listing_id || !row.source_listing_id) continue
    if (identity.source_listing_id !== row.source_listing_id) continue
    if (!dateWindowsOverlap(input.dateStart, input.dateEnd, row.date_start ?? null, row.date_end ?? null)) {
      continue
    }
    return classifySameKeyMatch(identity, row, row.source_url === input.sourceUrl)
  }

  for (const row of dedupeCandidates(input.existingRowsByAddressDate)) {
    if (!isActiveCandidate(row)) continue
    const incomingAddr = normalizeAddressLine(input.normalizedAddress)
    const existingAddr = normalizeAddressLine(row.normalized_address)
    if (!incomingAddr || !existingAddr || incomingAddr !== existingAddr) continue
    if (!dateWindowsOverlap(input.dateStart, input.dateEnd, row.date_start ?? null, row.date_end ?? null)) {
      continue
    }
    return baseResult({
      decision: 'same_event_updated',
      saleInstanceKey: key,
      matchedIngestedSaleId: row.id,
      supersedesIngestedSaleId: null,
      confidence: 'medium',
      reasons: ['normalized_address_overlap', 'date_window_overlap'],
      identity,
    })
  }

  const incomingBucket = normalizeLocationBucket({
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
  })
  for (const row of dedupeCandidates(input.existingRowsByAddressDate)) {
    if (!isActiveCandidate(row)) continue
    if (row.lat == null || row.lng == null || input.lat == null || input.lng == null) continue
    const rowBucket = normalizeLocationBucket({
      state: input.state,
      city: input.city,
      normalizedAddress: row.normalized_address ?? null,
    })
    if (rowBucket !== incomingBucket) continue
    if (!dateWindowsOverlap(input.dateStart, input.dateEnd, row.date_start ?? null, row.date_end ?? null)) {
      continue
    }
    return baseResult({
      decision: 'same_event_updated',
      saleInstanceKey: key,
      matchedIngestedSaleId: row.id,
      supersedesIngestedSaleId: null,
      confidence: 'medium',
      reasons: ['coordinate_bucket_overlap', 'date_window_overlap'],
      identity,
    })
  }

  // URL history includes expired rows so YSTM URL reuse can revive prior events (Phase 5/6).
  const urlRow = input.existingRowsBySourceUrl.find((r) => r.id?.trim())
  if (urlRow) {
    return classifyAgainstUrlRow(input, identity, urlRow)
  }

  return baseResult({
    decision: 'new_event_new_url',
    saleInstanceKey: key,
    matchedIngestedSaleId: null,
    supersedesIngestedSaleId: null,
    confidence: 'high',
    reasons: ['no_existing_match'],
    identity,
  })
}

export function isPrioritySaleInstanceDecision(decision: SaleInstanceDecision): boolean {
  return decision === 'new_event_same_url'
}

export function shouldReviveExpiredRowForSaleInstanceDecision(
  decision: SaleInstanceDecision
): boolean {
  return decision === 'new_event_same_url'
}

export function shouldSupersedePublishedSaleForDecision(
  decision: SaleInstanceDecision
): boolean {
  return decision === 'new_event_same_url'
}

/** Telemetry-safe fields for observability (no PII). */
export function saleInstanceClassificationTelemetry(
  result: ClassifySaleInstanceResult
): Record<string, unknown> {
  return {
    saleInstanceDecision: result.decision,
    saleInstanceConfidence: result.confidence,
    saleInstanceReasons: result.reasons.slice(0, 8),
    saleInstanceKey: result.saleInstanceKey,
    matchedIngestedSaleId: result.matchedIngestedSaleId,
    supersedesIngestedSaleId: result.supersedesIngestedSaleId,
  }
}
