import type { YstmDetailFirstFallbackReason } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'
import {
  classifyPostgresInsertError,
  type PostgresInsertErrorLike,
} from '@/lib/ingestion/acquisition/classifyPostgresInsertError'

export type DetailFirstInsertFailureClassification = {
  reason: Extract<YstmDetailFirstFallbackReason, 'insert_failed' | 'canonical_collision'>
  dbCode: string | null
  dbMessage: string | null
}

/**
 * Classify detail-first ingested_sales insert errors for metrics and recovery.
 */
export function classifyDetailFirstInsertFailure(
  error: PostgresInsertErrorLike
): DetailFirstInsertFailureClassification {
  const dbMessage = error?.message?.trim() ? error.message.trim() : null
  const classified = classifyPostgresInsertError({
    error,
    insertReturnedRow: false,
    collisionResolutionAttempted: false,
    collisionResolutionSucceeded: false,
  })

  const isUniqueViolation =
    classified.messageClass === 'unique_violation' ||
    /duplicate key|unique constraint|violates unique constraint/i.test(dbMessage ?? '')

  return {
    reason: isUniqueViolation ? 'canonical_collision' : 'insert_failed',
    dbCode: classified.code,
    dbMessage,
  }
}

export function insertFailureTelemetryFields(
  classification: DetailFirstInsertFailureClassification
): Record<string, unknown> {
  return {
    insertFailureDbCode: classification.dbCode,
    insertFailureMessage: classification.dbMessage,
  }
}
