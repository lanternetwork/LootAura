import { isIngestedRowExpiredForDuplicate } from '@/lib/ingestion/acquisition/duplicateSkipKinds'
import {
  classifyYstmUrlReuseFromListSeed,
  isPriorityYstmUrlReuseRefresh,
  type YstmUrlReuseEventKind,
} from '@/lib/ingestion/identity/classifyYstmUrlReuseEvent'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import {
  evaluateDuplicateSkipForExternalListListing,
  type ExternalListDuplicateProbe,
} from '@/lib/ingestion/dedupe'
import type { getAdminDb } from '@/lib/supabase/clients'

const DEFAULT_LIST_RECRAWL_REFRESH_MAX_PER_PAGE = 32

function parsePositiveInt(raw: string | undefined, fallback: number, cap: number): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, cap)
}

/**
 * Bounded detail-first refreshes per list page during external crawl (Phase 6).
 */
export function parseYstmListRecrawlRefreshMaxPerPage(
  env: NodeJS.ProcessEnv = process.env
): number {
  return parsePositiveInt(
    env.INGESTION_YSTM_LIST_RECRAWL_REFRESH_MAX_PER_PAGE,
    DEFAULT_LIST_RECRAWL_REFRESH_MAX_PER_PAGE,
    100
  )
}

/**
 * When list crawl sees an existing source_url, refresh YSTM detail rows instead of skipping forever.
 * Expired rows stay on the duplicate-skip path.
 */
export function shouldRefreshYstmDetailOnListRecrawl(
  sourceUrl: string,
  existing: { status: string | null | undefined; failure_reasons: unknown }
): boolean {
  if (!isYstmDetailListingUrl(sourceUrl)) return false
  if (isIngestedRowExpiredForDuplicate(existing.status, existing.failure_reasons)) {
    return false
  }
  return true
}

export type YstmListRecrawlExistingRow = {
  id: string
  status: string | null | undefined
  failure_reasons: unknown
  date_start: string | null
  date_end: string | null
  normalized_address: string | null
  sale_instance_key?: string | null
  source_listing_id?: string | null
  source_content_hash?: string | null
}

/**
 * Phase 5/6: classify URL reuse before refresh vs duplicate skip (identity-first).
 */
export function classifyYstmUrlReuseForListRecrawl(
  input: {
    sourcePlatform: string
    sourceUrl: string
    state?: string | null
    city?: string | null
    listing: {
      startDate: string | null | undefined
      endDate: string | null | undefined
      addressRaw: string | null | undefined
    }
    existing: YstmListRecrawlExistingRow
  }
): YstmUrlReuseEventKind {
  return classifyYstmUrlReuseFromListSeed({
    sourcePlatform: input.sourcePlatform,
    sourceUrl: input.sourceUrl,
    state: input.state ?? null,
    city: input.city ?? null,
    normalizedAddress: input.existing.normalized_address,
    listingStartDate: input.listing.startDate ?? null,
    listingEndDate: input.listing.endDate ?? null,
    listingAddressRaw: input.listing.addressRaw ?? null,
    existingIngestedSaleId: input.existing.id,
    existingSaleInstanceKey: input.existing.sale_instance_key ?? null,
    existingSourceListingId: input.existing.source_listing_id ?? null,
    existingSourceContentHash: input.existing.source_content_hash ?? null,
    existing: {
      status: String(input.existing.status ?? ''),
      failure_reasons: input.existing.failure_reasons,
      date_start: input.existing.date_start,
      date_end: input.existing.date_end,
      normalized_address: input.existing.normalized_address,
    },
  })
}

/** URL-reuse new events bypass the per-page refresh cap (false-exclusion fix). */
export function shouldQueueYstmListRecrawlRefresh(input: {
  sourcePlatform: string
  sourceUrl: string
  state?: string | null
  city?: string | null
  existing: YstmListRecrawlExistingRow
  listing: {
    startDate: string | null | undefined
    endDate: string | null | undefined
    addressRaw: string | null | undefined
  }
  refreshesQueued: number
  maxPerPage: number
}): { queue: boolean; urlReuseEvent: YstmUrlReuseEventKind; priority: boolean } {
  if (!isYstmDetailListingUrl(input.sourceUrl)) {
    return { queue: false, urlReuseEvent: 'expire_old_row', priority: false }
  }

  const urlReuseEvent = classifyYstmUrlReuseForListRecrawl({
    sourcePlatform: input.sourcePlatform,
    sourceUrl: input.sourceUrl,
    state: input.state,
    city: input.city,
    listing: input.listing,
    existing: input.existing,
  })
  const priority = isPriorityYstmUrlReuseRefresh(urlReuseEvent)

  if (priority) {
    return { queue: true, urlReuseEvent, priority: true }
  }

  if (!shouldRefreshYstmDetailOnListRecrawl(input.sourceUrl, input.existing)) {
    return { queue: false, urlReuseEvent, priority: false }
  }

  const queue = input.refreshesQueued < input.maxPerPage
  return { queue, urlReuseEvent, priority: false }
}

/**
 * List-parse soft dedupe uses slug/nearby addresses that detail-first would replace.
 * Defer until after detail HTML is merged (detail-first path or legacy fallback insert).
 */
export function shouldDeferListSeedSoftDedupe(sourceUrl: string): boolean {
  return isYstmDetailListingUrl(sourceUrl)
}

export async function evaluatePostDetailEnrichedDuplicateSkip(
  admin: ReturnType<typeof getAdminDb>,
  platform: string,
  probe: ExternalListDuplicateProbe
) {
  return evaluateDuplicateSkipForExternalListListing(admin, platform, probe)
}
