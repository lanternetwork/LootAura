/** Hard cap for POST `/api/admin/reconciliation/run` and worker `limit` option. */
export const MAX_RECONCILIATION_RUN_LIMIT = 100

export interface ReconciliationRunBodyParsed {
  readonly limit: number
  readonly dryRun: boolean
  readonly sourcePlatform: string | undefined
  readonly onlyPlaceholder: boolean
  /** Phase 2A: explicit true only; never defaulted on. */
  readonly applySafeSync: boolean
}

/**
 * Parse and normalize admin reconciliation run body (bounded, deterministic defaults).
 * Default `dryRun: true` unless `dryRun` is explicitly `false`.
 */
export function parseReconciliationRunBody(body: unknown): ReconciliationRunBodyParsed {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const limitRaw = o.limit
  const limitNum =
    typeof limitRaw === 'number'
      ? limitRaw
      : typeof limitRaw === 'string'
        ? Number.parseInt(limitRaw, 10)
        : Number.NaN
  const limit =
    Number.isFinite(limitNum) && limitNum > 0
      ? Math.min(Math.max(Math.floor(limitNum), 1), MAX_RECONCILIATION_RUN_LIMIT)
      : 25
  const dryRun = o.dryRun !== false
  const sp = o.sourcePlatform
  const sourcePlatform = typeof sp === 'string' && sp.trim() ? sp.trim() : undefined
  const onlyPlaceholder = o.onlyPlaceholder === true
  const applySafeSync = o.applySafeSync === true
  return { limit, dryRun, sourcePlatform, onlyPlaceholder, applySafeSync }
}
