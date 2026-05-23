import type { ExternalCrawlSkipSubReason } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import { classifyExistingUrlSkip } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import {
  classifySaleInstance,
  type ClassifySaleInstanceResult,
  type SaleInstanceDecision,
} from '@/lib/ingestion/identity/classifySaleInstance'

export type LegacyUrlGateDecision = 'no_existing_url' | 'duplicate_url_skip'

export type ShadowIngestedRowSnapshot = {
  id: string
  source_url: string
  status: string
  failure_reasons: unknown
  date_start: string | null
  date_end: string | null
  normalized_address: string | null
  lat?: number | null
  lng?: number | null
  source_listing_id?: string | null
  sale_instance_key?: string | null
  source_content_hash?: string | null
  superseded_by_ingested_sale_id?: string | null
}

export type ShadowReplayListingSeed = {
  sourcePlatform: string
  sourceUrl: string
  state: string | null
  city: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  lat?: number | null
  lng?: number | null
}

export type SaleInstanceShadowComparison = {
  oldDecision: LegacyUrlGateDecision
  newDecision: SaleInstanceDecision
  oldWouldSuppress: boolean
  newWouldSuppress: boolean
  wouldPublish: boolean
  wouldCreateNewInstance: boolean
  confidence: ClassifySaleInstanceResult['confidence']
  reasonCodes: string[]
  oldSkipSubReason: ExternalCrawlSkipSubReason | null
  divergenceKind: 'old_suppress_new_publish' | 'old_allow_new_suppress' | 'aligned' | null
  matchedIngestedSaleId: string | null
  saleInstanceKey: string | null
}

export function wouldPublishFromSaleInstanceDecision(decision: SaleInstanceDecision): boolean {
  return (
    decision === 'new_event_same_url' ||
    decision === 'new_event_new_url' ||
    decision === 'same_event_updated'
  )
}

export function wouldCreateNewInstanceFromDecision(decision: SaleInstanceDecision): boolean {
  return decision === 'new_event_same_url' || decision === 'new_event_new_url'
}

export function wouldSuppressFromNewDecision(decision: SaleInstanceDecision): boolean {
  return (
    decision === 'same_event_no_change' ||
    decision === 'stale_event_expired' ||
    decision === 'invalid_event'
  )
}

export function evaluateLegacyUrlGateDecision(
  ingested: ShadowIngestedRowSnapshot | null,
  listing: Pick<ShadowReplayListingSeed, 'dateStart' | 'dateEnd' | 'normalizedAddress'> & {
    addressRaw?: string | null
  }
): {
  oldDecision: LegacyUrlGateDecision
  oldWouldSuppress: boolean
  oldSkipSubReason: ExternalCrawlSkipSubReason | null
} {
  if (!ingested) {
    return { oldDecision: 'no_existing_url', oldWouldSuppress: false, oldSkipSubReason: null }
  }

  const oldSkipSubReason = classifyExistingUrlSkip({
    listingStartDate: listing.dateStart,
    listingEndDate: listing.dateEnd,
    listingAddressRaw: listing.addressRaw ?? listing.normalizedAddress,
    existing: {
      status: ingested.status,
      failure_reasons: ingested.failure_reasons,
      date_start: ingested.date_start,
      date_end: ingested.date_end,
      normalized_address: ingested.normalized_address,
    },
  })

  return {
    oldDecision: 'duplicate_url_skip',
    oldWouldSuppress: true,
    oldSkipSubReason,
  }
}

export function evaluateNewClassifierDecision(
  listing: ShadowReplayListingSeed,
  ingested: ShadowIngestedRowSnapshot | null
): ClassifySaleInstanceResult {
  const existingRow = ingested
    ? {
        id: ingested.id,
        source_url: ingested.source_url,
        source_listing_id: ingested.source_listing_id ?? null,
        sale_instance_key: ingested.sale_instance_key ?? null,
        source_content_hash: ingested.source_content_hash ?? null,
        date_start: ingested.date_start,
        date_end: ingested.date_end,
        normalized_address: ingested.normalized_address,
        lat: ingested.lat ?? null,
        lng: ingested.lng ?? null,
        status: ingested.status,
        failure_reasons: ingested.failure_reasons,
        superseded_by_ingested_sale_id: ingested.superseded_by_ingested_sale_id ?? null,
      }
    : null

  return classifySaleInstance({
    sourcePlatform: listing.sourcePlatform,
    sourceUrl: listing.sourceUrl,
    state: listing.state,
    city: listing.city,
    normalizedAddress: listing.normalizedAddress,
    dateStart: listing.dateStart,
    dateEnd: listing.dateEnd,
    lat: listing.lat ?? null,
    lng: listing.lng ?? null,
    existingRowsBySourceUrl: existingRow ? [existingRow] : [],
    existingRowsBySaleInstanceKey:
      existingRow?.sale_instance_key?.trim()
        ? [
            {
              id: existingRow.id,
              sale_instance_key: existingRow.sale_instance_key,
              source_listing_id: existingRow.source_listing_id ?? null,
              date_start: existingRow.date_start,
              date_end: existingRow.date_end,
              normalized_address: existingRow.normalized_address,
              status: existingRow.status,
              failure_reasons: existingRow.failure_reasons,
            },
          ]
        : [],
    existingRowsByAddressDate: [],
  })
}

function divergenceKindFromComparison(
  oldWouldSuppress: boolean,
  wouldPublish: boolean,
  newWouldSuppress: boolean
): SaleInstanceShadowComparison['divergenceKind'] {
  if (oldWouldSuppress && wouldPublish) return 'old_suppress_new_publish'
  if (!oldWouldSuppress && newWouldSuppress) return 'old_allow_new_suppress'
  return 'aligned'
}

export function compareShadowSaleInstanceDecisions(
  listing: ShadowReplayListingSeed,
  ingested: ShadowIngestedRowSnapshot | null
): SaleInstanceShadowComparison {
  const legacy = evaluateLegacyUrlGateDecision(ingested, {
    dateStart: listing.dateStart,
    dateEnd: listing.dateEnd,
    normalizedAddress: listing.normalizedAddress,
    addressRaw: listing.normalizedAddress,
  })
  const classified = evaluateNewClassifierDecision(listing, ingested)
  const wouldPublish = wouldPublishFromSaleInstanceDecision(classified.decision)
  const newWouldSuppress = wouldSuppressFromNewDecision(classified.decision)

  return {
    oldDecision: legacy.oldDecision,
    newDecision: classified.decision,
    oldWouldSuppress: legacy.oldWouldSuppress,
    newWouldSuppress,
    wouldPublish,
    wouldCreateNewInstance: wouldCreateNewInstanceFromDecision(classified.decision),
    confidence: classified.confidence,
    reasonCodes: classified.reasons.slice(0, 12),
    oldSkipSubReason: legacy.oldSkipSubReason,
    divergenceKind: divergenceKindFromComparison(
      legacy.oldWouldSuppress,
      wouldPublish,
      newWouldSuppress
    ),
    matchedIngestedSaleId: classified.matchedIngestedSaleId,
    saleInstanceKey: classified.saleInstanceKey,
  }
}

export function shadowSaleInstanceTelemetry(
  comparison: SaleInstanceShadowComparison
): Record<string, unknown> {
  return {
    oldDecision: comparison.oldDecision,
    newDecision: comparison.newDecision,
    wouldPublish: comparison.wouldPublish,
    wouldCreateNewInstance: comparison.wouldCreateNewInstance,
    wouldSuppress: comparison.oldWouldSuppress,
    newWouldSuppress: comparison.newWouldSuppress,
    confidence: comparison.confidence,
    reasonCodes: comparison.reasonCodes,
    oldSkipSubReason: comparison.oldSkipSubReason,
    divergenceKind: comparison.divergenceKind,
    matchedIngestedSaleId: comparison.matchedIngestedSaleId,
    saleInstanceKey: comparison.saleInstanceKey,
  }
}
