import { RawExternalSale, CityIngestionConfig, ProcessedIngestedSale, FailureReason } from '@/lib/ingestion/types'

function cleanText(value: string | null): string | null {
  if (value == null) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

function hasStreetNumberAndName(address: string | null): boolean {
  if (!address) return false
  return /^\s*\d+\s+.+/.test(address)
}

/** STEP 1: description + dateRaw, newlines → spaces, collapse whitespace. */
function normalizeIngestionDateTimeText(dateRaw: string | number | null, description: string | null): string {
  const parts = [description, dateRaw]
    .filter((x) => x != null && String(x).trim() !== '')
    .map(String)
  return parts.join(' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Single chronological token: M/D, optional explicit calendar year from ISO or M/D/YYYY. */
interface ExtractedDatePart {
  month: number
  day: number
  year?: number
  index: number
}

/**
 * STEP 2–4: one ordered `dates[]` — ISO, M/D/YYYY, then M/D excluding spans already covered
 * by the longer forms (so `5/1/2026` does not also yield `5/1`).
 */
function extractAllDates(text: string): ExtractedDatePart[] {
  const protectedSpans: { start: number; end: number }[] = []
  const out: ExtractedDatePart[] = []
  let m: RegExpExecArray | null

  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  while ((m = isoRe.exec(text)) !== null) {
    const year = Number.parseInt(m[1], 10)
    const month = Number.parseInt(m[2], 10)
    const day = Number.parseInt(m[3], 10)
    protectedSpans.push({ start: m.index, end: m.index + m[0].length })
    out.push({ month, day, year, index: m.index })
  }

  const mdyyyyRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g
  while ((m = mdyyyyRe.exec(text)) !== null) {
    protectedSpans.push({ start: m.index, end: m.index + m[0].length })
    const month = Number.parseInt(m[1], 10)
    const day = Number.parseInt(m[2], 10)
    const year = Number.parseInt(m[3], 10)
    out.push({ month, day, year, index: m.index })
  }

  const mdRe = /\b(\d{1,2})\/(\d{1,2})\b/g
  while ((m = mdRe.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (protectedSpans.some((s) => start >= s.start && end <= s.end)) {
      continue
    }
    out.push({
      month: Number.parseInt(m[1], 10),
      day: Number.parseInt(m[2], 10),
      index: start,
    })
  }

  out.sort((a, b) => a.index - b.index)
  return out
}

interface ClockPart {
  hour24: number
  minute: number
}

/** STEP 3: all 12h clock tokens (word-bounded). */
function extractAllTimes(text: string): ClockPart[] {
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi
  const out: ClockPart[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    let hour = Number.parseInt(m[1], 10)
    const minute = m[2] ? Number.parseInt(m[2], 10) : 0
    const period = m[3].toLowerCase()
    if (period === 'pm' && hour !== 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    if (Number.isFinite(hour) && Number.isFinite(minute) && minute >= 0 && minute <= 59 && hour >= 0 && hour <= 23) {
      out.push({ hour24: hour, minute })
    }
  }
  return out
}

function isValidCalendarMd(month: number, day: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

/** STEP 6: calendar M/D in listing timezone → YYYY-MM-DD (noon UTC anchor). */
function formatMdInTimezone(month: number, day: number, year: number, timezone: string): string | null {
  if (!isValidCalendarMd(month, day, year)) return null
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const d = new Date(`${year}-${mm}-${dd}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function formatClock(p: ClockPart): string {
  return `${String(p.hour24).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00`
}

function snapToThirtyMinutes(time: string): string {
  const [h, m] = time.split(':')
  const hour = Number.parseInt(h || '0', 10)
  const min = Number.parseInt(m || '0', 10)
  if (!Number.isFinite(hour) || !Number.isFinite(min)) return time
  const snapped = Math.round(min / 30) * 30
  const carry = snapped === 60 ? 1 : 0
  const nextHour = (hour + carry) % 24
  const finalMin = snapped === 60 ? 0 : snapped
  return `${String(nextHour).padStart(2, '0')}:${String(finalMin).padStart(2, '0')}:00`
}

export async function processIngestedSale(rawSale: RawExternalSale, cityConfig: CityIngestionConfig): Promise<ProcessedIngestedSale> {
  const failureReasons: FailureReason[] = []
  const addressRaw = cleanText(rawSale.addressRaw)
  const description = cleanText(rawSale.description)
  const city = cleanText(rawSale.cityHint) || cleanText(cityConfig.city)
  const state = cleanText(rawSale.stateHint) || cleanText(cityConfig.state)

  const normalizedAddress = addressRaw?.toLowerCase().replace(/\s+/g, ' ') || null
  if (!hasStreetNumberAndName(addressRaw)) {
    failureReasons.push(addressRaw ? 'invalid_address_format' : 'missing_address')
  }

  const normalized = normalizeIngestionDateTimeText(rawSale.dateRaw, description)
  const baseYear = new Date().getFullYear()
  const tz = cityConfig.timezone

  const dates = extractAllDates(normalized)
  let dateStart: string | null = null
  let dateEnd: string | null = null

  if (!normalized) {
    failureReasons.push('missing_date')
  } else if (dates.length === 0) {
    failureReasons.push('invalid_date')
  } else {
    const first = dates[0]
    const last = dates[dates.length - 1]
    const startYear = first.year ?? baseYear
    const startFmt = formatMdInTimezone(first.month, first.day, startYear, tz)
    if (!startFmt) {
      failureReasons.push('invalid_date')
    } else {
      dateStart = startFmt
      if (dates.length >= 2) {
        let endYear = last.year ?? baseYear
        const startTs = new Date(startYear, first.month - 1, first.day).getTime()
        const endTs = new Date(endYear, last.month - 1, last.day).getTime()
        if (endTs < startTs) {
          endYear += 1
        }
        const endFmt = formatMdInTimezone(last.month, last.day, endYear, tz)
        if (!endFmt) {
          failureReasons.push('invalid_date')
          dateStart = null
        } else {
          dateEnd = endFmt
        }
      }
    }
  }

  const times = extractAllTimes(normalized)
  let timeStartStr = '09:00:00'
  let timeEndStr = '14:00:00'
  let timeSource: 'explicit' | 'default' = 'default'

  if (times.length >= 2) {
    timeStartStr = formatClock(times[0])
    timeEndStr = formatClock(times[1])
    timeSource = 'explicit'
  } else if (times.length === 1) {
    timeStartStr = formatClock(times[0])
    timeEndStr = '14:00:00'
    timeSource = 'explicit'
  }

  const timeStart = snapToThirtyMinutes(timeStartStr)
  const timeEnd = snapToThirtyMinutes(timeEndStr)

  const hasAddressError = failureReasons.includes('missing_address') || failureReasons.includes('invalid_address_format')
  const hasDateError = failureReasons.includes('missing_date') || failureReasons.includes('invalid_date')
  const status: ProcessedIngestedSale['status'] =
    !hasAddressError && !hasDateError ? 'needs_geocode' : 'needs_check'
  const parseConfidence: ProcessedIngestedSale['parseConfidence'] = status === 'needs_geocode' ? 'high' : 'low'

  return {
    normalizedAddress,
    city,
    state,
    lat: null,
    lng: null,
    dateStart,
    dateEnd,
    timeStart,
    timeEnd,
    timeSource,
    dateSource: normalized ? 'source_date_raw' : null,
    status,
    failureReasons,
    parseConfidence,
  }
}
