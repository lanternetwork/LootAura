/** Heartbeat field excluded when deciding if a reconciliation patch is a no-op. */
const RECONCILIATION_HEARTBEAT_FIELDS = new Set(['last_source_sync_at'])

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

function fieldValuesEqual(prior: unknown, next: unknown): boolean {
  if (prior === next) return true
  if (prior == null && next == null) return true
  if (typeof prior === 'object' || typeof next === 'object') {
    return JSON.stringify(sortKeysDeep(prior)) === JSON.stringify(sortKeysDeep(next))
  }
  return false
}

/**
 * True when every non-heartbeat field in `patch` already matches `row` — skip UPDATE.
 * Counter fields (attempt/missing counts) must match exactly; callers only skip when counts unchanged.
 */
export function reconciliationPersistPatchUnchanged(
  row: Record<string, unknown>,
  patch: Record<string, unknown>
): boolean {
  for (const [key, nextVal] of Object.entries(patch)) {
    if (RECONCILIATION_HEARTBEAT_FIELDS.has(key)) continue
    if (!fieldValuesEqual(row[key], nextVal)) return false
  }
  return true
}
