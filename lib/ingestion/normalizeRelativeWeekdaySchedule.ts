/**
 * Deterministic relative weekday → calendar block (single contiguous sequence).
 * Pure: no I/O, no DOM. Anchor calendar date is taken in `timezone` (IANA).
 */

export type RelativeWeekdayRolloverReason = 'same_day' | 'next_occurrence'

export interface RelativeWeekdayScheduleDiagnostics {
  tokens: string[]
  /** YYYY-MM-DD in `timezone` for `anchorDate` */
  anchorLocalYmd: string
  /** First calendar day of the resolved block */
  blockStartYmd: string
  /** Last calendar day of the resolved block */
  blockEndYmd: string
  timezone: string
  rolloverReason: RelativeWeekdayRolloverReason
}

export interface NormalizeRelativeWeekdayScheduleInput {
  rawText: string
  anchorDate: Date
  /** IANA zone id (e.g. America/Chicago); used only for anchor civil calendar date. */
  timezone: string
}

export interface NormalizeRelativeWeekdayScheduleResult {
  dateStart: string
  /** Null when the block is a single calendar day */
  dateEnd: string | null
  diagnostics: RelativeWeekdayScheduleDiagnostics
}

interface Ymd {
  y: number
  m: number
  d: number
}

const WEEKDAY_PATTERN =
  /^(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\b/i

/** JS Sunday=0 … Saturday=6 */
function tokenToSun0(lower: string): number | null {
  const t = lower.toLowerCase()
  if (t === 'sun' || t === 'sunday') return 0
  if (t === 'mon' || t === 'monday') return 1
  if (t === 'tue' || t === 'tuesday') return 2
  if (t === 'wed' || t === 'wednesday') return 3
  if (t === 'thu' || t === 'thursday') return 4
  if (t === 'fri' || t === 'friday') return 5
  if (t === 'sat' || t === 'saturday') return 6
  return null
}

function civilWeekdaySun0(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay()
}

function parseYmd(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number.parseInt(m[1]!, 10)
  const mo = Number.parseInt(m[2]!, 10)
  const d = Number.parseInt(m[3]!, 10)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return { y, m: mo, d }
}

function addGregorianDays(ymd: Ymd, delta: number): Ymd {
  const utc = Date.UTC(ymd.y, ymd.m - 1, ymd.d + delta, 12, 0, 0)
  const dt = new Date(utc)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

function formatYyyyMmDd(ymd: Ymd): string {
  return `${String(ymd.y)}-${String(ymd.m).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}`
}

function zonedYmd(anchorDate: Date, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(anchorDate)
  } catch {
    return null
  }
}

/** Strict consume: only weekday tokens and separators `,` spaces `-` (hyphen already normalized). */
function tokenizeWeekdaySchedule(normalized: string): string[] | null {
  let s = normalized.trim()
  if (!s) return null

  // Disallow any character outside tokens + separators (letters only in tokens; also `-` `,` space)
  if (!/^[-,\s\w]+$/i.test(s)) return null

  const tokens: string[] = []

  const takeToken = (): boolean => {
    const m = s.match(WEEKDAY_PATTERN)
    if (!m || m[1] == null) return false
    const raw = m[1]
    if (tokenToSun0(raw) == null) return false
    tokens.push(raw.toLowerCase())
    s = s.slice(m[0].length)
    return true
  }

  if (!takeToken()) return null

  while (s.length > 0) {
    const sep = s.match(/^(\s+|,\s*|-\s*|\s*-)/)
    if (!sep) return null
    s = s.slice(sep[0].length)
    if (!takeToken()) return null
  }

  return tokens
}

function weekdayIndicesSun0(tokens: string[]): number[] {
  return tokens.map((t) => {
    const n = tokenToSun0(t)
    if (n == null) throw new Error('relative_weekday_token_invariant')
    return n
  })
}

function areConsecutiveCalendarWeekdaysSun0(ws: number[]): boolean {
  if (ws.length <= 1) return true
  for (let i = 0; i < ws.length - 1; i++) {
    const a = ws[i]!
    const b = ws[i + 1]!
    if ((b - a + 7) % 7 !== 1) return false
  }
  return true
}

function findEarliestBlockStartYmd(anchorYmd: Ymd, firstW: number): { ymd: Ymd; rollover: RelativeWeekdayRolloverReason } {
  const anchorWd = civilWeekdaySun0(anchorYmd)
  for (let k = 0; k < 7; k++) {
    const cand = addGregorianDays(anchorYmd, k)
    if (civilWeekdaySun0(cand) === firstW) {
      return {
        ymd: cand,
        rollover: k === 0 && anchorWd === firstW ? 'same_day' : 'next_occurrence',
      }
    }
  }
  throw new Error('relative_weekday_anchor_match_invariant')
}

/**
 * Normalize unicode + whitespace + dash variants like `sanitizeText` for date lines,
 * but preserve intent for weekday-only lines (single spaces).
 */
export function normalizeWeekdayScheduleRawLine(line: string): string {
  let text = line.normalize('NFKC').replace(/\u00A0/g, ' ')
  text = text.replace(/[‐-‒–—−]/g, '-')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

/**
 * Returns calendar dates for a strict weekday-only schedule, or `null`.
 */
/** Lexer + contiguous-weekday check only (no IANA anchor). For choosing a raw line vs junk. */
export function isRelativeWeekdayScheduleSyntaxOnly(rawText: string): boolean {
  const normalized = normalizeWeekdayScheduleRawLine(rawText)
  const parsedTokens = tokenizeWeekdaySchedule(normalized)
  if (!parsedTokens || parsedTokens.length === 0) return false
  const ws = weekdayIndicesSun0(parsedTokens)
  return areConsecutiveCalendarWeekdaysSun0(ws)
}

export function normalizeRelativeWeekdaySchedule(
  input: NormalizeRelativeWeekdayScheduleInput
): NormalizeRelativeWeekdayScheduleResult | null {
  const normalized = normalizeWeekdayScheduleRawLine(input.rawText)
  const parsedTokens = tokenizeWeekdaySchedule(normalized)
  if (!parsedTokens || parsedTokens.length === 0) {
    return null
  }

  const ws = weekdayIndicesSun0(parsedTokens)
  if (!areConsecutiveCalendarWeekdaysSun0(ws)) {
    return null
  }

  const anchorLocalYmd = zonedYmd(input.anchorDate, input.timezone)
  if (!anchorLocalYmd) {
    return null
  }

  const anchorYmd = parseYmd(anchorLocalYmd)
  if (!anchorYmd) return null

  const firstW = ws[0]!
  const { ymd: blockStart, rollover: rolloverReason } = findEarliestBlockStartYmd(anchorYmd, firstW)

  for (let i = 0; i < ws.length; i++) {
    const ymd = addGregorianDays(blockStart, i)
    if (civilWeekdaySun0(ymd) !== ws[i]) {
      return null
    }
  }

  const blockEnd = addGregorianDays(blockStart, ws.length - 1)
  const dateStart = formatYyyyMmDd(blockStart)
  const dateEnd = ws.length >= 2 ? formatYyyyMmDd(blockEnd) : null

  return {
    dateStart,
    dateEnd,
    diagnostics: {
      tokens: parsedTokens,
      anchorLocalYmd,
      blockStartYmd: dateStart,
      blockEndYmd: formatYyyyMmDd(blockEnd),
      timezone: input.timezone,
      rolloverReason,
    },
  }
}
