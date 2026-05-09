/**
 * Stale "publishing" reclaim rule for `lootaura_v2.claim_ingested_sales_for_publish`.
 *
 * Keep in sync with the `publishing` branch in:
 * `supabase/migrations/162_claim_publish_rpc_reclaim_ready_with_linked_sale.sql`
 *   (s.status = 'publishing' AND s.updated_at < now() - interval '30 minutes')
 *
 * Uses the same strict inequality as SQL (`<`, not `<=`).
 */
export const PUBLISH_CLAIM_STALE_PUBLISHING_MS = 30 * 60 * 1000

export function isPublishingRowStaleForPublishClaim(updatedAt: Date, now: Date): boolean {
  const cutoffMs = now.getTime() - PUBLISH_CLAIM_STALE_PUBLISHING_MS
  return updatedAt.getTime() < cutoffMs
}
