import {
  classifyExistingUrlSkip,
  type ExternalCrawlSkipSubReason,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import {
  isIngestedRowExpiredForDuplicate,
  type ExternalDuplicateSkipKind,
} from '@/lib/ingestion/acquisition/duplicateSkipKinds'
import {
  classifySaleInstance,
  isPrioritySaleInstanceDecision,
  type ClassifySaleInstanceResult,
  type ExistingIngestedSaleCandidate,
} from '@/lib/ingestion/identity/classifySaleInstance'
import {
  wouldPublishFromSaleInstanceDecision,
  wouldSuppressFromNewDecision,
} from '@/lib/ingestion/identity/shadowSaleInstanceReplay'

export type YstmEnforcedExistingUrlCrawlAction =
  | {
      kind: 'queue_detail_first'
      existingIngestedSaleId: string
      priority: boolean
      crawlSkipSubReason: ExternalCrawlSkipSubReason
    }
  | {
      kind: 'duplicate_skip'
      duplicateKind: ExternalDuplicateSkipKind
      crawlSkipSubReason: ExternalCrawlSkipSubReason
    }

export type ResolveYstmEnforcedExistingUrlCrawlActionInput = {
  sourcePlatform: string
  sourceUrl: string
  state: string | null
  city: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  addressRaw: string | null
  title?: string | null
  description?: string | null
  existing: ExistingIngestedSaleCandidate & {
    status: string | null
    failure_reasons: unknown
  }
  existingUrlCandidates: ExistingIngestedSaleCandidate[]
}

/**
 * Stage D (opt-in): `INGESTION_YSTM_SALE_INSTANCE_CLASSIFIER_ENFORCE=true`
 * uses sale-instance classifier decisions instead of URL-only duplicate skip on YSTM list crawl.
 */
export function isYstmSaleInstanceClassifierEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.INGESTION_YSTM_SALE_INSTANCE_CLASSIFIER_ENFORCE === 'true'
}

function buildSaleInstanceKeyCandidates(
  candidates: readonly ExistingIngestedSaleCandidate[]
): ExistingIngestedSaleCandidate[] {
  const seen = new Set<string>()
  const out: ExistingIngestedSaleCandidate[] = []
  for (const row of candidates) {
    const key = row.sale_instance_key?.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

function crawlSkipSubReasonForClassification(
  result: ClassifySaleInstanceResult,
  input: ResolveYstmEnforcedExistingUrlCrawlActionInput
): ExternalCrawlSkipSubReason {
  if (result.decision === 'same_event_no_change') {
    return 'url_match_same_payload'
  }
  if (result.decision === 'stale_event_expired') {
    return 'url_match_expired_row'
  }
  if (isPrioritySaleInstanceDecision(result.decision)) {
    return 'url_match_dates_changed'
  }
  if (result.decision === 'same_event_updated') {
    return 'url_match_refresh_queued'
  }
  if (result.decision === 'ambiguous_requires_review') {
    return 'unknown'
  }
  return classifyExistingUrlSkip({
    listingStartDate: input.dateStart,
    listingEndDate: input.dateEnd,
    listingAddressRaw: input.addressRaw ?? input.normalizedAddress,
    existing: {
      status: String(input.existing.status ?? ''),
      failure_reasons: input.existing.failure_reasons,
      date_start: input.existing.date_start ?? null,
      date_end: input.existing.date_end ?? null,
      normalized_address: input.existing.normalized_address ?? null,
    },
  })
}

function duplicateKindForClassification(
  result: ClassifySaleInstanceResult,
  existing: ResolveYstmEnforcedExistingUrlCrawlActionInput['existing']
): ExternalDuplicateSkipKind {
  if (isIngestedRowExpiredForDuplicate(String(existing.status ?? ''), existing.failure_reasons)) {
    return 'duplicate_expired_row'
  }
  if (result.decision === 'same_event_no_change') {
    return 'duplicate_existing_url'
  }
  return 'duplicate_existing_url'
}

/**
 * Resolves list-crawl action for an existing YSTM URL row when classifier enforcement is enabled.
 */
export function resolveYstmEnforcedExistingUrlCrawlAction(
  input: ResolveYstmEnforcedExistingUrlCrawlActionInput
): { action: YstmEnforcedExistingUrlCrawlAction; classification: ClassifySaleInstanceResult } {
  const classification = classifySaleInstance({
    sourcePlatform: input.sourcePlatform,
    sourceUrl: input.sourceUrl,
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    title: input.title ?? null,
    description: input.description ?? null,
    existingRowsBySourceUrl: input.existingUrlCandidates,
    existingRowsBySaleInstanceKey: buildSaleInstanceKeyCandidates(input.existingUrlCandidates),
    existingRowsByAddressDate: [],
  })

  const crawlSkipSubReason = crawlSkipSubReasonForClassification(classification, input)

  if (
    wouldPublishFromSaleInstanceDecision(classification.decision) ||
    classification.decision === 'ambiguous_requires_review'
  ) {
    return {
      classification,
      action: {
        kind: 'queue_detail_first',
        existingIngestedSaleId: String(input.existing.id),
        priority: isPrioritySaleInstanceDecision(classification.decision),
        crawlSkipSubReason,
      },
    }
  }

  if (wouldSuppressFromNewDecision(classification.decision)) {
    return {
      classification,
      action: {
        kind: 'duplicate_skip',
        duplicateKind: duplicateKindForClassification(classification, input.existing),
        crawlSkipSubReason,
      },
    }
  }

  return {
    classification,
    action: {
      kind: 'queue_detail_first',
      existingIngestedSaleId: String(input.existing.id),
      priority: false,
      crawlSkipSubReason,
    },
  }
}
