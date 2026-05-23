import {
  createEmptyDedupeDecisionAggregate,
  type DedupeDecisionAggregate,
} from '@/lib/ingestion/dedupe'
import {
  failureReasonList,
  isIngestedRowExpiredForDuplicate,
} from '@/lib/ingestion/acquisition/ingestedRowExpired'

export { failureReasonList, isIngestedRowExpiredForDuplicate }

/** Classified duplicate / skip reason at external list crawl time. */
export type ExternalDuplicateSkipKind =
  | 'duplicate_existing_url'
  | 'duplicate_cross_city_page'
  | 'duplicate_canonical_collision'
  | 'duplicate_expired_row'

export type ExternalDuplicateSkipCounts = {
  duplicate_existing_url: number
  duplicate_cross_city_page: number
  duplicate_canonical_collision: number
  duplicate_expired_row: number
}

export function emptyExternalDuplicateSkipCounts(): ExternalDuplicateSkipCounts {
  return {
    duplicate_existing_url: 0,
    duplicate_cross_city_page: 0,
    duplicate_canonical_collision: 0,
    duplicate_expired_row: 0,
  }
}

export function totalExternalDuplicateSkips(counts: ExternalDuplicateSkipCounts): number {
  return (
    counts.duplicate_existing_url +
    counts.duplicate_cross_city_page +
    counts.duplicate_canonical_collision +
    counts.duplicate_expired_row
  )
}

export type ExternalPersistDedupeTelemetry = DedupeDecisionAggregate & {
  duplicateSkipKinds: ExternalDuplicateSkipCounts
}

export function createEmptyExternalPersistDedupeTelemetry(): ExternalPersistDedupeTelemetry {
  return {
    ...createEmptyDedupeDecisionAggregate(),
    duplicateSkipKinds: emptyExternalDuplicateSkipCounts(),
  }
}

