/**
 * Stale "publishing" reclaim rule for `lootaura_v2.claim_ingested_sales_for_publish`.
 *
 * Keep in sync with the `publishing` branch in:
 * `supabase/migrations/166_legacy_publishing_past_end_date_validation_cleanup.sql`
 *   (stale publishing reclaim, excluding validation `past_end_date` residues)
 *
 * Uses the same strict inequality as SQL (`<`, not `<=`).
 */
export const PUBLISH_CLAIM_STALE_PUBLISHING_MS = 30 * 60 * 1000

export function isPublishingRowStaleForPublishClaim(updatedAt: Date, now: Date): boolean {
  const cutoffMs = now.getTime() - PUBLISH_CLAIM_STALE_PUBLISHING_MS
  return updatedAt.getTime() < cutoffMs
}

/**
 * Mirrors the NOT (...) predicate on `failure_details` in migration 166's publish claim RPC.
 * Rows in `publishing` with validation `past_end_date` must not be reclaimed for publish retry.
 */
export function isPublishingRowStaleReclaimBlockedByPastEndDateValidation(failureDetails: unknown): boolean {
  if (!failureDetails || typeof failureDetails !== 'object') return false
  const o = failureDetails as Record<string, unknown>
  return o.reason === 'past_end_date' && o.phase === 'validation'
}
