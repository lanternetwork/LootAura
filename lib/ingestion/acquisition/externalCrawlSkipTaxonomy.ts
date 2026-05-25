/**
 * Phase 2: external crawl skip sub-reasons (observability only).
 * @see docs/EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md
 */

import { calendarDaysBetweenUtc } from '@/lib/ingestion/duplicateScoring'
import { isIngestedRowExpiredForDuplicate } from '@/lib/ingestion/acquisition/ingestedRowExpired'

/** Default date tolerance aligned with soft-dedupe / sale-instance spec (±3 days). */
export const CRAWL_SKIP_DATE_TOLERANCE_DAYS = 3

export const EXTERNAL_CRAWL_SKIP_SUB_REASONS = [
  'url_match_same_dates',
  'url_match_same_payload',
  'url_match_refresh_queued',
  'soft_dedupe_exact_address_date',
  'url_match_dates_changed',
  'url_match_location_changed',
  'url_match_content_changed',
  'soft_dedupe_cross_city',
  'expired_false_positive',
  'gated_false_positive',
  'unknown',
  'url_match_expired_row',
  'url_match_superseded_row',
  'invalid_detail_payload',
  'repair_pending',
  'publish_failed',
  'duplicate_cross_provider',
  'duplicate_cross_provider_soft',
  'duplicate_cross_metro',
  'provider_observation_suppressed',
] as const

export type ExternalCrawlSkipSubReason = (typeof EXTERNAL_CRAWL_SKIP_SUB_REASONS)[number]

export const BENIGN_CRAWL_SKIP_SUB_REASONS: readonly ExternalCrawlSkipSubReason[] = [
  'url_match_same_dates',
  'url_match_same_payload',
  'url_match_refresh_queued',
  'soft_dedupe_exact_address_date',
] as const

export const SUSPICIOUS_CRAWL_SKIP_SUB_REASONS: readonly ExternalCrawlSkipSubReason[] = [
  'url_match_dates_changed',
  'url_match_location_changed',
  'url_match_content_changed',
  'soft_dedupe_cross_city',
  'expired_false_positive',
  'gated_false_positive',
  'unknown',
  'duplicate_cross_provider',
  'duplicate_cross_provider_soft',
  'duplicate_cross_metro',
  'provider_observation_suppressed',
] as const

export const OPERATIONAL_CRAWL_SKIP_SUB_REASONS: readonly ExternalCrawlSkipSubReason[] = [
  'url_match_expired_row',
  'url_match_superseded_row',
  'invalid_detail_payload',
  'repair_pending',
  'publish_failed',
] as const

export type ExternalCrawlSkipSubReasonCounts = Record<ExternalCrawlSkipSubReason, number>

export type CrawlSkipTaxonomyCategory = 'benign' | 'suspicious' | 'operational'

export function emptyExternalCrawlSkipSubReasonCounts(): ExternalCrawlSkipSubReasonCounts {
  return Object.fromEntries(
    EXTERNAL_CRAWL_SKIP_SUB_REASONS.map((r) => [r, 0])
  ) as ExternalCrawlSkipSubReasonCounts
}

export function bumpCrawlSkipSubReason(
  counts: ExternalCrawlSkipSubReasonCounts,
  reason: ExternalCrawlSkipSubReason
): void {
  counts[reason] += 1
}

export function mergeCrawlSkipSubReasonCounts(
  target: ExternalCrawlSkipSubReasonCounts,
  source: ExternalCrawlSkipSubReasonCounts
): void {
  for (const reason of EXTERNAL_CRAWL_SKIP_SUB_REASONS) {
    target[reason] += source[reason] ?? 0
  }
}

export function mergeCrawlSkipSubReasonFromRecord(
  target: ExternalCrawlSkipSubReasonCounts,
  source: Record<string, number> | undefined
): void {
  if (!source) return
  for (const reason of EXTERNAL_CRAWL_SKIP_SUB_REASONS) {
    const n = source[reason]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      target[reason] += n
    }
  }
}

export function operationalCrawlSkipSubReasons(counts: ExternalCrawlSkipSubReasonCounts): number {
  return OPERATIONAL_CRAWL_SKIP_SUB_REASONS.reduce((sum, r) => sum + counts[r], 0)
}

export function crawlSkipSubReasonCategory(reason: ExternalCrawlSkipSubReason): CrawlSkipTaxonomyCategory {
  if ((BENIGN_CRAWL_SKIP_SUB_REASONS as readonly string[]).includes(reason)) return 'benign'
  if ((SUSPICIOUS_CRAWL_SKIP_SUB_REASONS as readonly string[]).includes(reason)) return 'suspicious'
  return 'operational'
}

export function totalCrawlSkipSubReasons(counts: ExternalCrawlSkipSubReasonCounts): number {
  return EXTERNAL_CRAWL_SKIP_SUB_REASONS.reduce((sum, r) => sum + counts[r], 0)
}

export function suspiciousCrawlSkipSubReasons(counts: ExternalCrawlSkipSubReasonCounts): number {
  return SUSPICIOUS_CRAWL_SKIP_SUB_REASONS.reduce((sum, r) => sum + counts[r], 0)
}

export function benignCrawlSkipSubReasons(counts: ExternalCrawlSkipSubReasonCounts): number {
  return BENIGN_CRAWL_SKIP_SUB_REASONS.reduce((sum, r) => sum + counts[r], 0)
}

function normalizeAddressLine(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
}

export type ExistingUrlSkipContext = {
  listingStartDate: string | null
  listingEndDate: string | null
  listingAddressRaw: string | null
  existing: {
    status: string
    failure_reasons: unknown
    date_start: string | null
    date_end: string | null
    normalized_address: string | null
  }
}

/**
 * Classify skip when source_url already exists and refresh path was not taken.
 */
export function classifyExistingUrlSkip(ctx: ExistingUrlSkipContext): ExternalCrawlSkipSubReason {
  if (isIngestedRowExpiredForDuplicate(ctx.existing.status, ctx.existing.failure_reasons)) {
    return 'url_match_expired_row'
  }

  const listingStart = ctx.listingStartDate?.trim() || null
  const existingStart = ctx.existing.date_start?.trim() || null
  if (listingStart && existingStart) {
    const dayDelta = calendarDaysBetweenUtc(listingStart, existingStart)
    if (dayDelta > CRAWL_SKIP_DATE_TOLERANCE_DAYS) {
      return 'url_match_dates_changed'
    }
  }

  const listingAddr = normalizeAddressLine(ctx.listingAddressRaw)
  const existingAddr = normalizeAddressLine(ctx.existing.normalized_address)
  if (listingAddr && existingAddr && listingAddr !== existingAddr) {
    return 'url_match_location_changed'
  }

  return 'url_match_same_dates'
}

export function classifySoftDedupeListSkip(
  evaluation: { suppress: boolean; confidence?: string } | null
): ExternalCrawlSkipSubReason {
  if (evaluation?.confidence === 'exact_duplicate') {
    return 'soft_dedupe_exact_address_date'
  }
  return 'soft_dedupe_cross_city'
}

export function classifyDetailFirstFallbackSkip(fallbackReason: string): ExternalCrawlSkipSubReason {
  const r = fallbackReason.toLowerCase()
  if (r.includes('gated') || r.includes('address_validation')) {
    return 'gated_false_positive'
  }
  if (r.includes('expired')) {
    return 'expired_false_positive'
  }
  if (r.includes('publish_failed')) {
    return 'publish_failed'
  }
  if (r.includes('spatial') || r.includes('geocode') || r.includes('coordinate')) {
    return 'invalid_detail_payload'
  }
  if (r.includes('insert')) {
    return 'invalid_detail_payload'
  }
  return 'invalid_detail_payload'
}
