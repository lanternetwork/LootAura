/**
 * UTC calendar sale-window helpers (shared crawl + publish paths).
 * Compares YYYY-MM-DD strings only — no local timezone conversion on listing dates.
 */

export function utcTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function coerceIngestedDateToYyyyMmDd(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return m?.[1] ?? null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return null
}

/** True when `date_end` (or lone `date_start`) is strictly before UTC today. */
export function hasPastEndDate(dateEnd: unknown, dateStart?: unknown): boolean {
  const end = coerceIngestedDateToYyyyMmDd(dateEnd)
  const start = coerceIngestedDateToYyyyMmDd(dateStart)
  const today = utcTodayDateString()
  if (end) return end < today
  if (start) return start < today
  return false
}

/** Crawl-time: skip inventory that cannot publish due to past sale window. */
export function isSaleWindowExpiredAtDiscovery(dateStart: unknown, dateEnd: unknown): boolean {
  return hasPastEndDate(dateEnd, dateStart)
}
