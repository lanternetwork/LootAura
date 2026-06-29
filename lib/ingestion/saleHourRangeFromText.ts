/**
 * Detect and parse explicit sale-hour windows in listing prose (extension upload + ingest).
 * Supports `9:00 am - 3:00 pm`, `9:00 AM to 3:00 PM`, en dash, and compact `9am - 3pm`.
 */

const SALE_HOUR_TIME_FRAGMENT =
  '(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}(?::\\d{2})?(?:am|pm))'

const SALE_HOUR_RANGE_RE = new RegExp(
  `${SALE_HOUR_TIME_FRAGMENT}\\s*(?:to|[-–—])\\s*${SALE_HOUR_TIME_FRAGMENT}`,
  'gi'
)

/** True when the whole line is only a sale-hour window (preserve during description sanitization). */
export function isStandaloneSaleHourRangeLine(line: string): boolean {
  const normalized = String(line || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false
  SALE_HOUR_RANGE_RE.lastIndex = 0
  const m = SALE_HOUR_RANGE_RE.exec(normalized)
  if (!m) return false
  return m[0].trim().length === normalized.length
}

/** True when text contains an explicit sale-hour window (inline or standalone). */
export function textContainsSaleHourRange(text: string): boolean {
  SALE_HOUR_RANGE_RE.lastIndex = 0
  return SALE_HOUR_RANGE_RE.test(String(text || ''))
}

export function parseUs12hFragmentToDbTime(fragment: string): string | null {
  const t = String(fragment || '').trim()
  const m =
    t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i) ?? t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i)
  if (!m) return null
  let hour = Number.parseInt(m[1], 10)
  const minute = m[2] != null && m[2] !== '' ? Number.parseInt(m[2], 10) : 0
  const period = m[3].toLowerCase()
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59 || hour < 1 || hour > 12) {
    return null
  }
  if (period === 'pm' && hour !== 12) hour += 12
  if (period === 'am' && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

/**
 * Returns the last explicit sale-hour range in text (later ranges win over earlier lone times like sign-up `8am`).
 */
export function extractAuthoritativeSaleHourRangeFromText(
  text: string
): { readonly timeStart: string; readonly timeEnd: string } | null {
  const source = String(text || '')
  if (!source.trim()) return null

  const re = new RegExp(
    `${SALE_HOUR_TIME_FRAGMENT}\\s*(?:to|[-–—])\\s*${SALE_HOUR_TIME_FRAGMENT}`,
    'gi'
  )
  let last: { timeStart: string; timeEnd: string } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const start = parseUs12hFragmentToDbTime(m[1])
    const end = parseUs12hFragmentToDbTime(m[2])
    if (start && end) {
      last = { timeStart: start, timeEnd: end }
    }
  }
  return last
}

/**
 * Last explicit standalone sale start phrase (e.g. `Start time: 8am`) when no hour range exists.
 * Ignores bare `at 8am` prose so sign-in / door copy does not become the sale start.
 */
export function extractStandaloneSaleStartTimeFromText(text: string): string | null {
  const source = String(text || '')
  if (!source.trim()) return null

  const re = new RegExp(
    `(?:start\\s*time|starts?\\s+at|begins?\\s+at|sale\\s+starts?)\\s*:?\\s*${SALE_HOUR_TIME_FRAGMENT}`,
    'gi'
  )
  let last: string | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const parsed = parseUs12hFragmentToDbTime(m[1])
    if (parsed) last = parsed
  }
  return last
}

/**
 * YSTM detail-page schedule: explicit hour range first, then standalone start phrases.
 * `timeEnd` is null when only a standalone start time was found.
 */
export function extractYstmDetailSaleHoursFromText(
  text: string
): { readonly timeStart: string; readonly timeEnd: string | null } | null {
  const range = extractAuthoritativeSaleHourRangeFromText(text)
  if (range) {
    return { timeStart: range.timeStart, timeEnd: range.timeEnd }
  }
  const standaloneStart = extractStandaloneSaleStartTimeFromText(text)
  if (standaloneStart) {
    return { timeStart: standaloneStart, timeEnd: null }
  }
  return null
}
