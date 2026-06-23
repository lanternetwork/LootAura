import type { YstmDetailPageParsed } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { isYstmPlaceholderAddressLine } from '@/lib/ingestion/acquisition/ystmDetailPageAddressResolver'
import {
  coerceIngestedDateToYyyyMmDd,
  hasPastEndDate,
  isSaleWindowExpiredAtDiscovery,
} from '@/lib/ingestion/saleWindowDates'

export const YSTM_COVERAGE_TARGET_PCT = 90

export type YstmCoverageInvalidReason =
  | 'fetch_not_found'
  | 'fetch_failed'
  | 'unparseable_detail'
  | 'listing_removed'
  | 'missing_title'
  | 'missing_dates'
  | 'expired'
  | 'archived'
  | 'address_terminal'
  | 'gated_only'
  | 'insufficient_visible_content'

export type YstmCoverageValidityResult =
  | { valid: true }
  | { valid: false; reason: YstmCoverageInvalidReason }

export function classifyFetchErrorForCoverage(msg: string): YstmCoverageInvalidReason {
  if (/http_error:\s*404/i.test(msg)) return 'fetch_not_found'
  return 'fetch_failed'
}

/** True when HTML body suggests the listing is gone (404 pages sometimes return 200). */
export function htmlSuggestsYstmListingRemoved(html: string): boolean {
  const t = html.toLowerCase()
  return (
    /page not found|404 error|listing (?:has been )?removed|sale (?:is )?no longer available|this (?:yard|garage) sale (?:has|is) (?:ended|over)/i.test(
      t
    ) && !/listing\.html|userlisting\.html/i.test(t.slice(0, 500))
  )
}

function hasVisibleContent(parsed: YstmDetailPageParsed): boolean {
  if (parsed.description?.trim() && parsed.description.trim().length >= 20) return true
  if (parsed.addressRaw?.trim() && !isYstmPlaceholderAddressLine(parsed.addressRaw)) return true
  if (parsed.nativeCoords) return true
  return false
}

/**
 * Whether a fetched YSTM detail page represents a valid active sale visible to a YSTM user.
 * Used as the coverage audit denominator (Phase 1).
 */
export function classifyYstmDetailAsValidActive(input: {
  parsed: YstmDetailPageParsed | null
  html?: string
}): YstmCoverageValidityResult {
  if (input.html && htmlSuggestsYstmListingRemoved(input.html)) {
    return { valid: false, reason: 'listing_removed' }
  }
  if (!input.parsed) {
    return { valid: false, reason: 'unparseable_detail' }
  }
  const parsed = input.parsed
  if (!parsed.title?.trim()) {
    return { valid: false, reason: 'missing_title' }
  }
  if (!coerceIngestedDateToYyyyMmDd(parsed.startDate) && !coerceIngestedDateToYyyyMmDd(parsed.endDate)) {
    return { valid: false, reason: 'missing_dates' }
  }
  if (
    isSaleWindowExpiredAtDiscovery(parsed.startDate, parsed.endDate) ||
    hasPastEndDate(parsed.endDate, parsed.startDate)
  ) {
    return { valid: false, reason: 'expired' }
  }
  if (!parsed.addressRaw?.trim() && parsed.addressSource == null && !parsed.nativeCoords) {
    return { valid: false, reason: 'gated_only' }
  }
  if (!hasVisibleContent(parsed)) {
    return { valid: false, reason: 'insufficient_visible_content' }
  }
  return { valid: true }
}

export function computeCoveragePct(params: {
  validActiveYstmUrls: number
  publishedVisibleInAudit: number
}): number | null {
  const { validActiveYstmUrls, publishedVisibleInAudit } = params
  if (validActiveYstmUrls <= 0) return null
  return Math.round((publishedVisibleInAudit / validActiveYstmUrls) * 10000) / 100
}
