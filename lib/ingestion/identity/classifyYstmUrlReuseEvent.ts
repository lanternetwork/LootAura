import type { ExistingUrlSkipContext } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import {
  classifySaleInstance,
  type SaleInstanceDecision,
} from '@/lib/ingestion/identity/classifySaleInstance'

export type YstmUrlReuseEventKind =
  | 'same_event_no_op'
  | 'same_event_update'
  | 'new_event_same_url'
  | 'expire_old_row'
  | 'ambiguous'

export type YstmUrlReuseListSeedContext = ExistingUrlSkipContext & {
  listingStartDate: string | null
  listingEndDate: string | null
  sourcePlatform: string
  sourceUrl: string
  state?: string | null
  city?: string | null
  normalizedAddress?: string | null
  existingIngestedSaleId: string
  existingSaleInstanceKey?: string | null
  existingSourceListingId?: string | null
  existingSourceContentHash?: string | null
}

function mapSaleInstanceDecisionToUrlReuseEvent(
  decision: SaleInstanceDecision
): YstmUrlReuseEventKind {
  switch (decision) {
    case 'same_event_no_change':
      return 'same_event_no_op'
    case 'same_event_updated':
      return 'same_event_update'
    case 'new_event_same_url':
      return 'new_event_same_url'
    case 'stale_event_expired':
      return 'expire_old_row'
    default:
      return 'ambiguous'
  }
}

/**
 * Phase 5 list-seed URL reuse event (delegates to Phase 6 classifier).
 */
export function classifyYstmUrlReuseFromListSeed(
  ctx: YstmUrlReuseListSeedContext
): YstmUrlReuseEventKind {
  const result = classifySaleInstance({
    sourcePlatform: ctx.sourcePlatform,
    sourceUrl: ctx.sourceUrl,
    state: ctx.state ?? null,
    city: ctx.city ?? null,
    normalizedAddress: ctx.normalizedAddress ?? ctx.existing.normalized_address ?? null,
    dateStart: ctx.listingStartDate,
    dateEnd: ctx.listingEndDate,
    existingRowsBySourceUrl: [
      {
        id: ctx.existingIngestedSaleId,
        source_url: ctx.sourceUrl,
        source_listing_id: ctx.existingSourceListingId ?? null,
        sale_instance_key: ctx.existingSaleInstanceKey ?? null,
        source_content_hash: ctx.existingSourceContentHash ?? null,
        date_start: ctx.existing.date_start,
        date_end: ctx.existing.date_end,
        normalized_address: ctx.existing.normalized_address,
        status: ctx.existing.status,
        failure_reasons: ctx.existing.failure_reasons,
      },
    ],
    existingRowsBySaleInstanceKey: ctx.existingSaleInstanceKey
      ? [
          {
            id: ctx.existingIngestedSaleId,
            sale_instance_key: ctx.existingSaleInstanceKey,
            source_listing_id: ctx.existingSourceListingId ?? null,
            date_start: ctx.existing.date_start,
            date_end: ctx.existing.date_end,
            normalized_address: ctx.existing.normalized_address,
            status: ctx.existing.status,
            failure_reasons: ctx.existing.failure_reasons,
          },
        ]
      : [],
    existingRowsByAddressDate: [],
  })

  return mapSaleInstanceDecisionToUrlReuseEvent(result.decision)
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
