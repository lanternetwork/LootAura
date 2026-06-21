import { createHash } from 'node:crypto'

export const POSTGRES_INSERT_MESSAGE_CLASSES = [
  'unique_violation',
  'check_violation',
  'not_null_violation',
  'foreign_key_violation',
  'permission_denied',
  'invalid_text_representation',
  'unknown_db_error',
  'no_row_returned_after_insert',
  'collision_resolution_failed',
] as const

export type PostgresInsertMessageClass = (typeof POSTGRES_INSERT_MESSAGE_CLASSES)[number]

export type PostgresInsertErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
} | null

export type ClassifyPostgresInsertErrorInput = {
  error: PostgresInsertErrorLike
  insertReturnedRow: boolean
  collisionResolutionAttempted?: boolean
  collisionResolutionSucceeded?: boolean
}

export type ClassifyPostgresInsertErrorResult = {
  code: string | null
  messageClass: PostgresInsertMessageClass
  constraint: string | null
}

function extractPostgresCode(message: string | undefined, code: string | undefined): string | null {
  if (typeof code === 'string' && code.trim()) return code.trim()
  if (!message) return null
  const match = message.match(/\b([0-9]{5})\b/)
  return match?.[1] ?? null
}

export function extractPostgresConstraintName(error: PostgresInsertErrorLike): string | null {
  const parts = [error?.details, error?.hint, error?.message].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  )
  for (const part of parts) {
    const quoted = part.match(/constraint "([^"]+)"/i)
    if (quoted?.[1]) return quoted[1]
    const unquoted = part.match(/unique constraint "([^"]+)"/i)
    if (unquoted?.[1]) return unquoted[1]
  }
  return null
}

function messageClassForCode(code: string | null): PostgresInsertMessageClass {
  switch (code) {
    case '23505':
      return 'unique_violation'
    case '23514':
      return 'check_violation'
    case '23502':
      return 'not_null_violation'
    case '23503':
      return 'foreign_key_violation'
    case '42501':
      return 'permission_denied'
    case '22P02':
      return 'invalid_text_representation'
    default:
      return 'unknown_db_error'
  }
}

/**
 * Map Postgres insert errors to sanitized messageClass values (list-fast + detail-first).
 */
export function classifyPostgresInsertError(
  input: ClassifyPostgresInsertErrorInput
): ClassifyPostgresInsertErrorResult {
  const dbMessage = input.error?.message?.trim() ? input.error.message.trim() : null
  const code = extractPostgresCode(dbMessage ?? undefined, input.error?.code)
  const constraint = extractPostgresConstraintName(input.error)

  if (
    input.collisionResolutionAttempted &&
    !input.collisionResolutionSucceeded &&
    !input.insertReturnedRow
  ) {
    return {
      code,
      messageClass: 'collision_resolution_failed',
      constraint,
    }
  }

  if (!input.error && !input.insertReturnedRow) {
    return {
      code: null,
      messageClass: 'no_row_returned_after_insert',
      constraint: null,
    }
  }

  if (/duplicate key|unique constraint|violates unique constraint/i.test(dbMessage ?? '')) {
    return {
      code,
      messageClass: 'unique_violation',
      constraint,
    }
  }

  return {
    code,
    messageClass: messageClassForCode(code),
    constraint,
  }
}

export function hashDiagnosticValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return createHash('sha256').update(trimmed, 'utf8').digest('hex')
}
