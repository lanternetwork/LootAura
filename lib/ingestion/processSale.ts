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

function sanitizeText(input: string): string {
  if (!input) return ''

  let text = input

  // 1. Normalize unicode (critical)
  text = text.normalize('NFKC')

  // 2. Replace non-breaking spaces
  text = text.replace(/\u00A0/g, ' ')

  // 3. Normalize all dash types → standard hyphen
  text = text.replace(/[‐-‒–—−]/g, '-')

  // 4. Normalize all whitespace
  text = text.replace(/\s+/g, ' ')

  // 5. Trim
  text = text.trim()

  return text
}

/** Single chronological token: M/D, optional explicit calendar year from ISO or M/D/YYYY. */
interface DateCandidate {
  month: number
  day: number
  year?: number
  index: number
}

/**
 * STEP 2–4: one ordered `dates[]` — ISO, M/D/YYYY, then M/D excluding spans already covered
 * by the longer forms (so `5/1/2026` does not also yield `5/1`).
 */
function extractDateCandidates(text: string): DateCandidate[] {
  const protectedSpans: { start: number; end: number }[] = []
  const out: DateCandidate[] = []
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
function extractTimeCandidates(text: string): ClockPart[] {
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

function isValidMonthDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

/** STEP 6: deterministic YYYY-MM-DD (no Date/Intl/timezone dependence). */
function formatYyyyMmDd(year: number, month: number, day: number): string {
  const yyyy = String(year)
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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

function resolveDates(
  candidates: DateCandidate[],
  baseYear: number
): { dateStart: string | null; dateEnd: string | null; invalidDate: boolean } {
  if (candidates.length === 0) {
    return { dateStart: null, dateEnd: null, invalidDate: true }
  }

  const first = candidates[0]
  const last = candidates[candidates.length - 1]
  if (!first || !last) {
    throw new Error('DATE_RESOLVER_INVARIANT_VIOLATION')
  }
  if (
    !Number.isFinite(first.month) ||
    !Number.isFinite(first.day) ||
    !Number.isFinite(last.month) ||
    !Number.isFinite(last.day)
  ) {
    throw new Error('DATE_RESOLVER_INVARIANT_VIOLATION')
  }
  if (!isValidMonthDay(first.month, first.day)) {
    return { dateStart: null, dateEnd: null, invalidDate: true }
  }

  const startYear = first.year ?? baseYear
  const dateStart = formatYyyyMmDd(startYear, first.month, first.day)
  let dateEnd: string | null = null

  if (candidates.length >= 2) {
    if (!isValidMonthDay(last.month, last.day)) {
      return { dateStart: null, dateEnd: null, invalidDate: true }
    }
    let endYear = last.year ?? startYear
    const endEarlier = last.month < first.month || (last.month === first.month && last.day < first.day)
    if (endEarlier) {
      endYear += 1
    }
    dateEnd = formatYyyyMmDd(endYear, last.month, last.day)
  }

  return { dateStart, dateEnd, invalidDate: false }
}

function resolveTimes(candidates: ClockPart[]): { timeStart: string; timeEnd: string; timeSource: 'explicit' | 'default' } {
  let timeStartStr = '09:00:00'
  let timeEndStr = '14:00:00'
  let timeSource: 'explicit' | 'default' = 'default'

  if (candidates.length >= 2) {
    timeStartStr = formatClock(candidates[0])
    timeEndStr = formatClock(candidates[1])
    timeSource = 'explicit'
  } else if (candidates.length === 1) {
    timeStartStr = formatClock(candidates[0])
    timeEndStr = '14:00:00'
    timeSource = 'explicit'
  }

  return {
    timeStart: snapToThirtyMinutes(timeStartStr),
    timeEnd: snapToThirtyMinutes(timeEndStr),
    timeSource,
  }
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

  const combinedRaw = `${rawSale.description || ''}\n${rawSale.dateRaw || ''}`
  const combinedText = sanitizeText(combinedRaw)
  const baseYear = new Date().getFullYear()

  const dateCandidates = extractDateCandidates(combinedText)
  let dateStart: string | null = null
  let dateEnd: string | null = null

  if (!combinedText) {
    failureReasons.push('missing_date')
  } else {
    const resolvedDates = resolveDates(dateCandidates, baseYear)
    dateStart = resolvedDates.dateStart
    dateEnd = resolvedDates.dateEnd
    if (resolvedDates.invalidDate) {
      failureReasons.push('invalid_date')
    }
  }

  const timeCandidates = extractTimeCandidates(combinedText)
  const resolvedTimes = resolveTimes(timeCandidates)

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
    timeStart: resolvedTimes.timeStart,
    timeEnd: resolvedTimes.timeEnd,
    timeSource: resolvedTimes.timeSource,
    dateSource: combinedText ? 'source_date_raw' : null,
    status,
    failureReasons,
    parseConfidence,
  }
}
