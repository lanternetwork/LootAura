/**
 * Phase 4 public listing read filters (non-owner / map-search-count paths).
 * Mirrors `sales_public_read` RLS and `lootaura_v2.is_sale_publicly_visible` (migration 172).
 *
 * Transition: `ends_at IS NULL` rows remain visible until a later phase fail-closes NULL.
 */

/** Human-readable copy of the DB predicate (RLS + is_sale_publicly_visible). */
export const PHASE4_PUBLIC_PUBLISHED_READ_SQL_PREDICATE = [
  "status = 'published'",
  'AND archived_at IS NULL',
  'AND (ends_at IS NULL OR ends_at > now())',
  "AND (moderation_status IS DISTINCT FROM 'hidden_by_admin')",
].join('\n')

/** PostgREST `.or()` fragment: listing still live when ends_at unset or strictly after `now`. */
export function phase4PublicLiveEndsAtOrFilter(now: Date = new Date()): string {
  const iso = now.toISOString()
  return `ends_at.is.null,ends_at.gt.${iso}`
}

/** PostgREST `.or()` fragment: treat NULL moderation_status as visible; exclude hidden_by_admin. */
export function phase4PublicModerationVisibleOrFilter(): string {
  return 'moderation_status.is.null,moderation_status.neq.hidden_by_admin'
}

export type Phase4PublicReadFilterOptions = {
  /** Defaults to `new Date()`; use fixed clock in tests. */
  now?: Date
  /** When false, omit moderation `.or()` (retry path if column missing). Default true. */
  includeModeration?: boolean
}

/**
 * Applies AND filters equivalent to public `sales_public_read` for explicit server queries.
 * Chain before bbox / text / category filters. Caller should not also `.in('status', ['published','active'])`.
 */
export function applyPhase4PublicPublishedSaleReadFilters<T extends Record<string, unknown>>(
  query: T,
  options?: Phase4PublicReadFilterOptions
): T {
  const now = options?.now ?? new Date()
  const includeModeration = options?.includeModeration !== false

  let q = (query as any)
    .eq('status', 'published')
    .is('archived_at', null)
    .or(phase4PublicLiveEndsAtOrFilter(now))

  if (includeModeration) {
    q = q.or(phase4PublicModerationVisibleOrFilter())
  }
  return q as T
}
