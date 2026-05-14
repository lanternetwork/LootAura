/**
 * Detects PostgREST / Postgres errors that conclusively mean `moderation_status`
 * is absent (schema transition). Used to decide the rare "retry without moderation filter" path.
 *
 * Broad substring matching on arbitrary errors is intentionally rejected — that can fail-open
 * (e.g. transient errors whose message mentions the column name).
 */

const MOD = 'moderation_status'

function combinedMessageFields(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const e = error as { message?: unknown; details?: unknown; hint?: unknown }
  return [e.message, e.details, e.hint]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join('\n')
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const c = (error as { code?: unknown }).code
  return typeof c === 'string' ? c : ''
}

export function isPostgrestMissingModerationStatusColumn(error: unknown): boolean {
  const text = combinedMessageFields(error)
  if (!text.toLowerCase().includes(MOD)) {
    return false
  }
  const code = errorCode(error)
  // PostgREST: column not in schema cache / unknown column in request
  if (code === 'PGRST204') return true
  // PostgreSQL undefined_column
  if (code === '42703') return true
  return false
}
