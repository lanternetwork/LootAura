import type { IngestionStatus } from '@/lib/ingestion/types'

/**
 * Non-terminal ingestion statuses that must not retain a prior `published_sale_id` /
 * `published_at` after a manual upload reopens the row (stale linkage cleanup).
 */
const REOPEN_UPLOAD_STATUSES_CLEARING_PUBLISH_LINK: ReadonlySet<IngestionStatus> = new Set([
  'needs_geocode',
  'needs_check',
  'ready',
  'publishing',
])

/**
 * When an existing ingested row is updated by upload into a non-published lifecycle
 * state, clear publish linkage columns so ops/UI cannot see `needs_geocode` + sale id, etc.
 * Returns `null` when the new status is `published` or any other status (no-op).
 */
export function publishLinkageFieldsToClearOnReopenUpload(status: string): {
  published_sale_id: null
  published_at: null
} | null {
  if (status === 'published') {
    return null
  }
  if (REOPEN_UPLOAD_STATUSES_CLEARING_PUBLISH_LINK.has(status as IngestionStatus)) {
    return { published_sale_id: null, published_at: null }
  }
  return null
}
