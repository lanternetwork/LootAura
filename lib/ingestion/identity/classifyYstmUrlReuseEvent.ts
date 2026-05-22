import {
  CRAWL_SKIP_DATE_TOLERANCE_DAYS,
  type ExistingUrlSkipContext,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import { calendarDaysBetweenUtc } from '@/lib/ingestion/duplicateScoring'
import { isIngestedRowExpiredForDuplicate } from '@/lib/ingestion/acquisition/ingestedRowExpired'
import { isSaleWindowExpiredAtDiscovery } from '@/lib/ingestion/saleWindowDates'

export type YstmUrlReuseEventKind =
  | 'same_event_no_op'
  | 'same_event_update'
  | 'new_event_same_url'
  | 'expire_old_row'
  | 'ambiguous'

export type YstmUrlReuseListSeedContext = ExistingUrlSkipContext & {
  listingStartDate: string | null
  listingEndDate: string | null
}

function normalizeAddressLine(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
}

function datesBeyondTolerance(
  listingStart: string | null,
  existingStart: string | null
): boolean {
  if (!listingStart?.trim() || !existingStart?.trim()) return false
  const dayDelta = calendarDaysBetweenUtc(listingStart.trim(), existingStart.trim())
  return dayDelta > CRAWL_SKIP_DATE_TOLERANCE_DAYS
}

/**
 * Phase 5: classify list-seed observation when source_url already exists.
 * Drives priority detail refresh and supersession (not URL-only skip).
 */
export function classifyYstmUrlReuseFromListSeed(
  ctx: YstmUrlReuseListSeedContext
): YstmUrlReuseEventKind {
  const existingExpired = isIngestedRowExpiredForDuplicate(
    ctx.existing.status,
    ctx.existing.failure_reasons
  )
  const listingExpired = isSaleWindowExpiredAtDiscovery(
    ctx.listingStartDate,
    ctx.listingEndDate
  )

  if (existingExpired && !listingExpired) {
    return 'new_event_same_url'
  }

  if (existingExpired && listingExpired) {
    return 'expire_old_row'
  }

  if (datesBeyondTolerance(ctx.listingStartDate, ctx.existing.date_start)) {
    return 'new_event_same_url'
  }

  const listingAddr = normalizeAddressLine(ctx.listingAddressRaw)
  const existingAddr = normalizeAddressLine(ctx.existing.normalized_address)
  if (listingAddr && existingAddr && listingAddr !== existingAddr) {
    return 'new_event_same_url'
  }

  if (listingAddr && existingAddr && listingAddr === existingAddr) {
    return 'same_event_update'
  }

  if (ctx.listingStartDate?.trim() && ctx.existing.date_start?.trim()) {
    return 'same_event_update'
  }

  return 'ambiguous'
}

export function isPriorityYstmUrlReuseRefresh(event: YstmUrlReuseEventKind): boolean {
  return event === 'new_event_same_url'
}

export function saleInstanceKeysMateriallyDiffer(
  priorKey: string | null | undefined,
  nextKey: string | null | undefined
): boolean {
  const prior = priorKey?.trim() || null
  const next = nextKey?.trim() || null
  if (prior && next) return prior !== next
  return false
}
