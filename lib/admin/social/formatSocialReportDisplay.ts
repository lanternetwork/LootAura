import type { MetroWeekendWindow } from '@/lib/seo/weekendBoundaries'

/** Hero date line e.g. "June 13–14, 2026" from metro-local weekend window. */
export function formatWeekendHeroDateRange(weekend: MetroWeekendWindow, timeZone: string): string {
  const start = parseYmd(weekend.start)
  const end = parseYmd(weekend.end)
  const startLabel = formatShortDate(start, timeZone)
  const endLabel = formatShortDate(end, timeZone)

  if (start.year === end.year && start.month === end.month) {
    const monthName = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'long',
    }).format(noonUtc(start))
    return `${monthName} ${start.day}–${end.day}, ${start.year}`
  }

  return `${startLabel}–${endLabel}`
}

/** Report generation timestamp in metro timezone e.g. "June 7, 2026\n8:15 AM CDT". */
export function formatSocialReportTimestamp(instant: Date, timeZone: string): string {
  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(instant)

  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(instant)

  return `${datePart}\n${timePart}`
}

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split('-').map(Number)
  return { year, month, day }
}

function noonUtc(parts: { year: number; month: number; day: number }): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))
}

function formatShortDate(parts: { year: number; month: number; day: number }, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(noonUtc(parts))
}
