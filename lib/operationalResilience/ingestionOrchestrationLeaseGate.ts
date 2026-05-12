/**
 * Tier 0 operational resilience: pure rules for ingestion orchestration lease overlap prevention.
 * DB optimistic-lock details stay in `app/api/cron/daily/route.ts`; active/stale time rules live here for tests + reuse.
 */

export function parseIngestionOrchestrationLeaseSeconds(raw?: string): number {
  const defaultSeconds = 120
  if (raw === undefined || raw === '') return defaultSeconds
  const parsed = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(parsed) || parsed < 30) return defaultSeconds
  return Math.min(parsed, 600)
}

/**
 * Mirrors cron lease gate: a lease blocks overlapping runs when an owner exists and expiry is strictly in the future.
 */
export function isIngestionOrchestrationLeaseActiveAt(
  nowMs: number,
  leaseOwner: string | null | undefined,
  leaseExpiresAtIso: string | null | undefined
): boolean {
  const ownerNow = leaseOwner ?? null
  const expiresNow = leaseExpiresAtIso ?? null
  const currentExpiresMs =
    typeof expiresNow === 'string' && expiresNow.length > 0 ? Date.parse(expiresNow) : Number.NaN
  return (
    !!ownerNow &&
    Number.isFinite(currentExpiresMs) &&
    currentExpiresMs > nowMs
  )
}

export function isStaleOrchestrationLeaseAt(
  nowMs: number,
  leaseOwner: string | null | undefined,
  leaseExpiresAtIso: string | null | undefined
): boolean {
  const ownerNow = leaseOwner ?? null
  const expiresNow = leaseExpiresAtIso ?? null
  const currentExpiresMs =
    typeof expiresNow === 'string' && expiresNow.length > 0 ? Date.parse(expiresNow) : Number.NaN
  return !!ownerNow && Number.isFinite(currentExpiresMs) && currentExpiresMs <= nowMs
}
