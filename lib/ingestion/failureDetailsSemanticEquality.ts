/** Volatile timestamps rewritten on merge; excluded from semantic equality. */
export const VOLATILE_FAILURE_DETAIL_TIMESTAMP_KEYS = new Set(['recorded_at', 'archivedAt'])

function sortKeysDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (typeof value !== 'object') return value
  const obj = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key])
  }
  return sorted
}

export function stripVolatileFailureDetailTimestamps(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(stripVolatileFailureDetailTimestamps)
  if (typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (VOLATILE_FAILURE_DETAIL_TIMESTAMP_KEYS.has(key)) continue
    out[key] = stripVolatileFailureDetailTimestamps(child)
  }
  return out
}

function stableSemanticJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(stripVolatileFailureDetailTimestamps(value)))
}

/** True when business failure_details content matches (ignores recorded_at / archivedAt). */
export function failureDetailsSemanticallyEqual(existing: unknown, next: unknown): boolean {
  return stableSemanticJson(existing) === stableSemanticJson(next)
}
