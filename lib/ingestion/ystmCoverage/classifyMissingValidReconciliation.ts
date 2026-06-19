import { isIngestedRowExpiredForDuplicate } from '@/lib/ingestion/acquisition/duplicateSkipKinds'
import { isTerminalAddressDisposition } from '@/lib/ingestion/address/terminalAddressDisposition'
import type { MissingValidReconciliationClass } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliationTypes'
import type { FalseExclusionTraceBucket } from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { isLinkedSaleVisibilityFiltered, type LinkedSaleVisibilitySnapshot } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'
import { MISSING_INGEST_TERMINAL_FAILURE_REASON } from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedRecoveryConfig'
import { isMissingIngestFetchFailedRetryableRow } from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedCandidates'

export type ClassifyMissingValidReconciliationInput = {
  primaryBucket: FalseExclusionTraceBucket
  secondaryTags: string[]
  ingested: {
    address_status: string | null
    status: string | null
    published_sale_id: string | null
    is_duplicate: boolean
    failure_reasons: unknown
  } | null
  observation: {
    missing_ingestion_outcome: string | null
    missing_ingestion_failure_reason: string | null
    missing_ingestion_replay_count: number
  }
  linkedSale: LinkedSaleVisibilitySnapshot | null
  wouldPublishShadow: boolean
  visibleInPublishedIndex: boolean
  nowMs?: number
}

function isMissingIngestTerminal(input: ClassifyMissingValidReconciliationInput): boolean {
  return (
    input.observation.missing_ingestion_outcome === 'terminal' &&
    input.observation.missing_ingestion_failure_reason === MISSING_INGEST_TERMINAL_FAILURE_REASON
  )
}

function isDuplicateSuppressedBucket(primaryBucket: FalseExclusionTraceBucket): boolean {
  return primaryBucket === 'url_duplicate_suppressed' || primaryBucket === 'soft_dedupe_suppressed'
}

function isExpiredInventoryBucket(
  primaryBucket: FalseExclusionTraceBucket,
  ingested: ClassifyMissingValidReconciliationInput['ingested']
): boolean {
  if (primaryBucket === 'url_reuse_suspected') return true
  if (primaryBucket === 'expired_false_positive') return true
  if (
    ingested &&
    isIngestedRowExpiredForDuplicate(ingested.status, ingested.failure_reasons)
  ) {
    return primaryBucket === 'url_reuse_suspected' || primaryBucket === 'expired_false_positive'
  }
  return primaryBucket === 'url_reuse_suspected' || primaryBucket === 'expired_false_positive'
}

function isStaleObservation(input: ClassifyMissingValidReconciliationInput): boolean {
  if (input.visibleInPublishedIndex) return true
  if (input.secondaryTags.includes('observation_stale')) return true
  const outcome = input.observation.missing_ingestion_outcome
  if (outcome === 'ingested' || outcome === 'published') return true
  if (
    input.primaryBucket === 'published_not_visible' &&
    input.linkedSale &&
    !isLinkedSaleVisibilityFiltered(input.linkedSale, input.nowMs)
  ) {
    return true
  }
  return false
}

function isFetchFailedRetryable(input: ClassifyMissingValidReconciliationInput): boolean {
  return isMissingIngestFetchFailedRetryableRow({
    ystm_valid_active: true,
    lootaura_visible: false,
    missing_ingestion_outcome: input.observation.missing_ingestion_outcome,
    missing_ingestion_failure_reason: input.observation.missing_ingestion_failure_reason,
    missing_ingestion_replay_count: input.observation.missing_ingestion_replay_count,
    wouldPublish: input.wouldPublishShadow,
    hasPrimaryIngestedRow: Boolean(input.ingested && !input.ingested.is_duplicate),
  })
}

function isVisibilityFilter(input: ClassifyMissingValidReconciliationInput): boolean {
  if (input.primaryBucket !== 'published_not_visible') return false
  if (input.linkedSale && isLinkedSaleVisibilityFiltered(input.linkedSale, input.nowMs)) {
    return true
  }
  if (input.ingested?.published_sale_id && input.linkedSale) {
    return isLinkedSaleVisibilityFiltered(input.linkedSale, input.nowMs)
  }
  return false
}

/**
 * Priority-ordered reconciliation for missing valid YSTM URLs (production audit semantics).
 */
export function classifyMissingValidReconciliation(
  input: ClassifyMissingValidReconciliationInput
): MissingValidReconciliationClass {
  const nowMs = input.nowMs ?? Date.now()

  if (input.ingested && isTerminalAddressDisposition(input.ingested.address_status)) {
    return 'TRUE_TERMINAL'
  }
  if (input.primaryBucket === 'terminal_disposition') {
    return 'TRUE_TERMINAL'
  }

  if (isMissingIngestTerminal(input)) {
    return 'MISSING_INGEST_TERMINAL'
  }

  if (isDuplicateSuppressedBucket(input.primaryBucket)) {
    return 'DUPLICATE_SUPPRESSED'
  }

  if (isVisibilityFilter({ ...input, nowMs })) {
    return 'VISIBILITY_FILTER'
  }

  if (isStaleObservation(input)) {
    return 'STALE_OBSERVATION'
  }

  if (isExpiredInventoryBucket(input.primaryBucket, input.ingested)) {
    return 'EXPIRED_INVENTORY'
  }

  if (isFetchFailedRetryable(input)) {
    return 'MISSING_INGEST_FETCH_FAILED_RETRYABLE'
  }

  if (input.primaryBucket === 'gated_false_positive') {
    return 'GATED_WAIT'
  }

  if (input.primaryBucket === 'unknown') {
    return input.wouldPublishShadow ? 'UNKNOWN_ACTIONABLE' : 'UNKNOWN_NON_ACTIONABLE'
  }

  return 'RECOVERABLE'
}

export function isActionableMissingValidReconciliationClass(
  reconciliationClass: MissingValidReconciliationClass
): boolean {
  return reconciliationClass !== 'TRUE_TERMINAL' &&
    reconciliationClass !== 'MISSING_INGEST_TERMINAL' &&
    reconciliationClass !== 'DUPLICATE_SUPPRESSED' &&
    reconciliationClass !== 'VISIBILITY_FILTER' &&
    reconciliationClass !== 'EXPIRED_INVENTORY' &&
    reconciliationClass !== 'UNKNOWN_NON_ACTIONABLE'
}
