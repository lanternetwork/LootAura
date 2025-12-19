import type { Sale } from '@/lib/types'

export interface VisibilityWindow {
  windowStart: Date | null
  windowEnd: Date | null
}

/**
 * Compute the default "any future" window used by the main sales feed.
 *
 * Semantics:
 * - windowStart = today at 00:00 UTC
 * - windowEnd = null (unbounded future)
 */
export function getAnyFutureWindow(today: Date = new Date()): VisibilityWindow {
  const start = new Date(today)
  start.setUTCHours(0, 0, 0, 0)
  return { windowStart: start, windowEnd: null }
}

/**
 * Core date-window visibility check shared between /api/sales and favorites.
 *
 * Mirrors the logic in /api/sales:
 * - If no window set → always pass
 * - If windowStart set and windowEnd null ("any future") →
 *   - If sale has end_date: include when end >= windowStart (hasn't ended yet)
 *   - If sale has no end_date: treat as ongoing and include
 * - If both windowStart and windowEnd set → standard overlap logic
 */
export function isSaleWithinDateWindow(
  sale: Pick<Sale, 'date_start' | 'time_start' | 'date_end' | 'time_end'>,
  { windowStart, windowEnd }: VisibilityWindow
): boolean {
  if (!windowStart && !windowEnd) {
    return true
  }

  // "Any time in the future" (windowStart set, windowEnd null)
  if (windowStart && !windowEnd) {
    const saleEnd = sale.date_end
      ? new Date(`${sale.date_end}T${sale.time_end || '23:59:59'}`)
      : null

    // If sale has an end_date, include when it ends today or later
    if (saleEnd) {
      return saleEnd >= windowStart
    }

    // If sale has no end_date, treat as ongoing - include
    return true
  }

  // Specific date-range window: use overlap logic
  const saleStart = sale.date_start
    ? new Date(`${sale.date_start}T${sale.time_start || '00:00:00'}`)
    : null
  const saleEnd = sale.date_end
    ? new Date(`${sale.date_end}T${sale.time_end || '23:59:59'}`)
    : null

  // If a window is set, exclude rows with no date information
  if ((windowStart || windowEnd) && !saleStart && !saleEnd) return false

  const s = saleStart || saleEnd
  const e = saleEnd || saleStart
  if (!s || !e) return false

  const startOk = !windowEnd || s <= windowEnd
  const endOk = !windowStart || e >= windowStart
  return startOk && endOk
}

/**
 * Full public-visibility check for feed/favorites:
 * - status in ('published', 'active')
 * - not archived
 * - not hidden_by_admin (when column present)
 * - within the provided date window
 */
export function isSalePubliclyVisible(
  sale: Sale & { moderation_status?: string | null; archived_at?: string | null },
  window: VisibilityWindow
): boolean {
  // Status gate (defensive; feed also enforces this at query level)
  if (sale.status && !['published', 'active'].includes(sale.status)) {
    return false
  }

  // Archived gate
  if (sale.archived_at) {
    return false
  }

  // Moderation gate (tolerate missing column)
  const moderationStatus = sale.moderation_status
  if (moderationStatus === 'hidden_by_admin') {
    return false
  }

  return isSaleWithinDateWindow(sale, window)
}






