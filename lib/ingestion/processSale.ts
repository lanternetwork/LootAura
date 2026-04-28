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

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

function monthNumber(token: string): number | null {
  const value = MONTH_MAP[token.toLowerCase()]
  return Number.isFinite(value) ? value : null
}

/**
 * STEP 2–4: one ordered `dates[]` — ISO, M/D/YYYY, then M/D excluding spans already covered
 * by the longer forms (so `5/1/2026` does not also yield `5/1`).
 */
function extractDateCandidates(text: string): DateCandidate[] {
  const normalizedForDates = text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
  const protectedSpans: { start: number; end: number }[] = []
  const out: DateCandidate[] = []
  let m: RegExpExecArray | null

  const isoRe = /(\d{4})-(\d{2})-(\d{2})/g
  while ((m = isoRe.exec(normalizedForDates)) !== null) {
    const year = Number.parseInt(m[1], 10)
    const month = Number.parseInt(m[2], 10)
    const day = Number.parseInt(m[3], 10)
    protectedSpans.push({ start: m.index, end: m.index + m[0].length })
    out.push({ month, day, year, index: m.index })
  }

  const mdyyyyRe = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g
  while ((m = mdyyyyRe.exec(normalizedForDates)) !== null) {
    protectedSpans.push({ start: m.index, end: m.index + m[0].length })
    const month = Number.parseInt(m[1], 10)
    const day = Number.parseInt(m[2], 10)
    const year = Number.parseInt(m[3], 10)
    out.push({ month, day, year, index: m.index })
  }

  const mdRe = /(\d{1,2})\/(\d{1,2})/g
  while ((m = mdRe.exec(normalizedForDates)) !== null) {
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

  const monthNames = Object.keys(MONTH_MAP).join('|')
  const weekdayOpt = '(?:(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?),?\\s+)?'

  // Full month-name range: "May 2 - May 4", "May 2 to May 4", "May 2 through May 4"
  const monthRangeRe = new RegExp(
    `\\b${weekdayOpt}(${monthNames})\\s+(\\d{1,2})\\s*(?:-|to|through)\\s*(${monthNames})\\s+(\\d{1,2})\\b`,
    'gi'
  )
  while ((m = monthRangeRe.exec(normalizedForDates)) !== null) {
    const startMonth = monthNumber(m[1] || '')
    const endMonth = monthNumber(m[3] || '')
    const startDay = Number.parseInt(m[2] || '', 10)
    const endDay = Number.parseInt(m[4] || '', 10)
    if (!startMonth || !endMonth || !Number.isFinite(startDay) || !Number.isFinite(endDay)) continue

    out.push({ month: startMonth, day: startDay, index: m.index })

    const secondToken = `${m[3]} ${m[4]}`
    const secondTokenIndexInMatch = m[0].toLowerCase().indexOf(secondToken.toLowerCase())
    const secondIndex = secondTokenIndexInMatch >= 0 ? m.index + secondTokenIndexInMatch : m.index
    out.push({ month: endMonth, day: endDay, index: secondIndex })
  }

  // Compact range: "May 2-4"
  const monthCompactRangeRe = new RegExp(`\\b${weekdayOpt}(${monthNames})\\s+(\\d{1,2})-(\\d{1,2})\\b`, 'gi')
  while ((m = monthCompactRangeRe.exec(normalizedForDates)) !== null) {
    const month = monthNumber(m[1] || '')
    const startDay = Number.parseInt(m[2] || '', 10)
    const endDay = Number.parseInt(m[3] || '', 10)
    if (!month || !Number.isFinite(startDay) || !Number.isFinite(endDay)) continue

    out.push({ month, day: startDay, index: m.index })
    const dashPos = m[0].indexOf('-')
    const endIndex = dashPos >= 0 ? m.index + dashPos + 1 : m.index
    out.push({ month, day: endDay, index: endIndex })
  }

  // Single month-name date: "May 2", "Monday, May 4", "Tue May 5"
  const monthSingleRe = new RegExp(`\\b${weekdayOpt}(${monthNames})\\s+(\\d{1,2})\\b`, 'gi')
  while ((m = monthSingleRe.exec(normalizedForDates)) !== null) {
    const month = monthNumber(m[1] || '')
    const day = Number.parseInt(m[2] || '', 10)
    if (!month || !Number.isFinite(day)) continue
    out.push({ month, day, index: m.index })
  }

  out.sort((a, b) => a.index - b.index)
  return out
}

function dedupeDateCandidates(rawCandidates: DateCandidate[]): DateCandidate[] {
  const seen = new Set<string>()
  const deduped: DateCandidate[] = []
  for (const candidate of rawCandidates) {
    const key = `${candidate.month}-${candidate.day}-${candidate.year ?? 'base'}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(candidate)
  }
  return deduped
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
  const city = cleanText(rawSale.cityHint) || cleanText(cityConfig.city)
  const state = cleanText(rawSale.stateHint) || cleanText(cityConfig.state)

  const normalizedAddress = addressRaw?.toLowerCase().replace(/\s+/g, ' ') || null
  if (!hasStreetNumberAndName(addressRaw)) {
    failureReasons.push(addressRaw ? 'invalid_address_format' : 'missing_address')
  }

  const combinedRaw = `${rawSale.description || ''}\n${rawSale.dateRaw || ''}`
  const combinedText = sanitizeText(combinedRaw)
  const baseYear = new Date().getFullYear()

  const rawDateCandidates = extractDateCandidates(combinedText)
  const dedupedDateCandidates = dedupeDateCandidates(rawDateCandidates)
  const dateCandidates =
    rawDateCandidates.length >= 2 && dedupedDateCandidates.length < 2
      ? (() => {
          // eslint-disable-next-line no-console
          console.error('date_candidate_dedupe_collapse', {
            rawCount: rawDateCandidates.length,
            dedupedCount: dedupedDateCandidates.length,
            raw: rawDateCandidates,
            deduped: dedupedDateCandidates,
          })
          return rawDateCandidates
        })()
      : dedupedDateCandidates

  let dateStart: string | null = null
  let dateEnd: string | null = null

  let invalidDate = false
  if (!combinedText) {
    failureReasons.push('missing_date')
  } else {
    const resolvedDates = resolveDates(dateCandidates, baseYear)
    dateStart = resolvedDates.dateStart
    dateEnd = resolvedDates.dateEnd
    invalidDate = resolvedDates.invalidDate
    if (invalidDate) failureReasons.push('invalid_date')
  }

  // Invariant: if extraction found tokens, resolution must either produce dateStart
  // or explicitly mark invalid_date. Never silently collapse.
  if (rawDateCandidates.length >= 1 && !dateStart && !invalidDate) {
    // eslint-disable-next-line no-console
    console.error('date_resolution_invariant_failed', {
      rawCount: rawDateCandidates.length,
      dedupedCount: dedupedDateCandidates.length,
      usedCount: dateCandidates.length,
      raw: rawDateCandidates,
      deduped: dedupedDateCandidates,
    })
    failureReasons.push('invalid_date')
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
