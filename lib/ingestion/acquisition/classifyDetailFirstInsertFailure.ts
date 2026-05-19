import type { YstmDetailFirstFallbackReason } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'

export type DetailFirstInsertFailureClassification = {
  reason: Extract<YstmDetailFirstFallbackReason, 'insert_failed' | 'canonical_collision'>
  dbCode: string | null
  dbMessage: string | null
}

type InsertErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
} | null

function extractPostgresCode(message: string | undefined): string | null {
  if (!message) return null
  const match = message.match(/\b([0-9A-Z]{5})\b/)
  return match?.[1] ?? null
}

/**
 * Classify detail-first ingested_sales insert errors for metrics and recovery.
 */
export function classifyDetailFirstInsertFailure(
  error: InsertErrorLike
): DetailFirstInsertFailureClassification {
  const dbMessage = error?.message?.trim() ? error.message.trim() : null
  const dbCode =
    (typeof error?.code === 'string' && error.code.trim() ? error.code.trim() : null) ??
    extractPostgresCode(dbMessage ?? undefined)

  const isUniqueViolation =
    dbCode === '23505' ||
    /duplicate key|unique constraint|violates unique constraint/i.test(dbMessage ?? '')

  return {
    reason: isUniqueViolation ? 'canonical_collision' : 'insert_failed',
    dbCode,
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
