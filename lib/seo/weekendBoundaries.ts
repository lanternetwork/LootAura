/**
 * Metro-local weekend windows for SEO (Phase 3).
 * Boundaries use the metro IANA timezone — not server UTC or viewer timezone.
 */

export type MetroWeekendWindow = {
  /** Inclusive start (Saturday), YYYY-MM-DD in metro local calendar. */
  start: string
  /** Inclusive end (Sunday), YYYY-MM-DD in metro local calendar. */
  end: string
  /** Display label e.g. "This Weekend (May 31 – Jun 1, 2026)" */
  label: string
  /** Month + year for dynamic metadata e.g. "May 2026" */
  monthYearLabel: string
}

const WEEKDAY_SHORT_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export type MetroLocalDate = {
  year: number
  month: number
  day: number
  weekday: number
}

export function getMetroLocalDate(timeZone: string, instant: Date = new Date()): MetroLocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(instant)

  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const weekday = WEEKDAY_SHORT_TO_NUM[weekdayShort] ?? 1

  return { year, month, day, weekday }
}

export function toYmd(parts: { year: number; month: number; day: number }): string {
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${parts.year}-${m}-${d}`
}

/** Civil date arithmetic (date-only; no timezone/DST on the calendar day). */
export function addCalendarDays(
  parts: { year: number; month: number; day: number },
  deltaDays: number
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays))
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  }
}

/**
 * "This weekend" (Sat–Sun) in the metro timezone — aligned with product weekend presets.
 */
export function getThisWeekendWindowInMetro(
  timeZone: string,
  instant: Date = new Date()
): MetroWeekendWindow {
  const local = getMetroLocalDate(timeZone, instant)
  const { year, month, day, weekday } = local

  let saturday: { year: number; month: number; day: number }
  let sunday: { year: number; month: number; day: number }

  if (weekday === 0) {
    saturday = addCalendarDays({ year, month, day }, -1)
    sunday = { year, month, day }
  } else if (weekday === 6) {
    saturday = { year, month, day }
    sunday = addCalendarDays({ year, month, day }, 1)
  } else {
    saturday = addCalendarDays({ year, month, day }, 6 - weekday)
    sunday = addCalendarDays({ year, month, day }, 7 - weekday)
  }

  const start = toYmd(saturday)
  const end = toYmd(sunday)

  const satLabel = formatMetroLocalDateLabel(timeZone, saturday)
  const sunLabel = formatMetroLocalDateLabel(timeZone, sunday)
  const monthYearLabel = formatMetroMonthYear(timeZone, saturday)

  return {
    start,
    end,
    label: `This Weekend (${satLabel} – ${sunLabel})`,
    monthYearLabel,
  }
}

function formatMetroLocalDateLabel(
  timeZone: string,
  parts: { year: number; month: number; day: number }
): string {
  const noonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(noonUtc)
}

function formatMetroMonthYear(
  timeZone: string,
  parts: { year: number; month: number; day: number }
): string {
  const noonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    year: 'numeric',
  }).format(noonUtc)
}

export function saleOverlapsDateRange(
  sale: { date_start?: string | null; date_end?: string | null },
  rangeStart: string,
  rangeEnd: string
): boolean {
  if (!sale.date_start) return false
  const end = sale.date_end?.trim() || sale.date_start
  return sale.date_start <= rangeEnd && end >= rangeStart
}
