export type MissingValidReconciliationClass =
  | 'TRUE_TERMINAL'
  | 'MISSING_INGEST_TERMINAL'
  | 'DUPLICATE_SUPPRESSED'
  | 'VISIBILITY_FILTER'
  | 'EXPIRED_INVENTORY'
  | 'STALE_OBSERVATION'
  | 'MISSING_INGEST_FETCH_FAILED_RETRYABLE'
  | 'GATED_WAIT'
  | 'SCHEDULE_WAIT'
  | 'RECOVERABLE'
  | 'UNKNOWN_ACTIONABLE'
  | 'UNKNOWN_NON_ACTIONABLE'

export const NON_ACTIONABLE_RECONCILIATION_CLASSES = [
  'TRUE_TERMINAL',
  'MISSING_INGEST_TERMINAL',
  'DUPLICATE_SUPPRESSED',
  'VISIBILITY_FILTER',
  'EXPIRED_INVENTORY',
  'SCHEDULE_WAIT',
] as const satisfies readonly MissingValidReconciliationClass[]

export const ACTIONABLE_RECONCILIATION_CLASSES = [
  'STALE_OBSERVATION',
  'MISSING_INGEST_FETCH_FAILED_RETRYABLE',
  'GATED_WAIT',
  'RECOVERABLE',
  'UNKNOWN_ACTIONABLE',
] as const satisfies readonly MissingValidReconciliationClass[]

export type MissingValidReconciliationClassCounts = Record<MissingValidReconciliationClass, number>

export function emptyMissingValidReconciliationClassCounts(): MissingValidReconciliationClassCounts {
  return {
    TRUE_TERMINAL: 0,
    MISSING_INGEST_TERMINAL: 0,
    DUPLICATE_SUPPRESSED: 0,
    VISIBILITY_FILTER: 0,
    EXPIRED_INVENTORY: 0,
    STALE_OBSERVATION: 0,
    MISSING_INGEST_FETCH_FAILED_RETRYABLE: 0,
    GATED_WAIT: 0,
    SCHEDULE_WAIT: 0,
    RECOVERABLE: 0,
    UNKNOWN_ACTIONABLE: 0,
    UNKNOWN_NON_ACTIONABLE: 0,
  }
}

export function isActionableReconciliationClass(
  reconciliationClass: MissingValidReconciliationClass
): boolean {
  return (ACTIONABLE_RECONCILIATION_CLASSES as readonly string[]).includes(reconciliationClass)
}

export type ActionableMissingValidAggregate = {
  rawMissingValidYstmUrls: number
  effectiveMissingValidYstmUrls: number
  actionableMissingValidYstmUrls: number
  byReconciliationClass: MissingValidReconciliationClassCounts
  terminalDispositionCount: number
  visibilityFilterZombieCount: number
  expiredInventoryCount: number
  staleObservationCount: number
  recoverableCount: number
  missingIngestFetchFailedRetryableCount: number
  duplicateSuppressedCount: number
  unknownActionableCount: number
  unknownNonActionableCount: number
}
