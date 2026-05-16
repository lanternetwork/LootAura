import { isValidIanaTimeZoneId } from '@/lib/ingestion/resolveIanaTimezoneForIngestionZip5'

/**
 * Pure inputs for listing end instant. `listingTimezone` must be a valid IANA id.
 * `date_end` null => single-day sale (effective end date = `date_start`).
 * `time_end` null/blank => local end-of-day (23:59:59) on the effective end date.
 */
export type ComputeSaleEndsAtInput = {
  date_start: string
  time_start: string | null
  date_end: string | null
  time_end: string | null
  listingTimezone: string
}

export type ComputeSaleEndsAtResult =
  | { ok: true; endsAtIso: string }
  | { ok: false; reason: 'invalid_timezone' | 'invalid_date' | 'invalid_time' | 'wall_clock_unresolvable' }

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD_RE.exec(ymd.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

/** Parse H:mm or HH:mm:ss into 24h components; returns null if invalid. */
export function parseClockToHms(value: string | null | undefined): { h: number; mi: number; s: number } | null {
  if (value == null) return null
  const t = String(value).trim()
  if (!t) return null
  const parts = t.split(':').map((p) => p.trim())
  if (parts.length < 2) return null
  const h = Number.parseInt(parts[0]!, 10)
  const mi = Number.parseInt(parts[1]!, 10)
  const s = parts.length >= 3 ? Number.parseInt(parts[2]!, 10) : 0
  if (!Number.isFinite(h) || !Number.isFinite(mi) || !Number.isFinite(s)) return null
  if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null
  return { h, mi, s }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** sv-SE + IANA zone yields zero-padded `YYYY-MM-DD HH:mm:ss` suitable for lexicographic compare. */
function formatLocalYmdHms(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}

/**
 * Find UTC instant such that `timeZone` wall clock equals `YYYY-MM-DD HH:mm:ss`.
 * Uses Intl only (no PostgreSQL session TZ, no host-local implicit zone for the listing).
 */
function utcMsForWallClock(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number | null {
  if (!isValidIanaTimeZoneId(timeZone)) return null
  const ymdParts = parseYmd(ymd)
  if (!ymdParts) return null
  const { y, m, d } = ymdParts
  const target = `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`

  let lo = Date.UTC(y, m - 1, d - 2, 12, 0, 0, 0)
  let hi = Date.UTC(y, m - 1, d + 2, 12, 0, 0, 0)

  const fmt = (ms: number) => formatLocalYmdHms(ms, timeZone)

  for (let i = 0; i < 56 && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const got = fmt(mid)
    if (got < target) lo = mid
    else hi = mid
  }

  const candidates = [hi, lo, hi - 1000, hi + 1000, hi - 3600000, hi + 3600000, hi - 7200000, hi + 7200000]
  for (const cand of candidates) {
    if (fmt(cand) === target) return cand
  }

  return null
}

/**
 * Deterministic listing end instant in UTC (ISO string with Z).
 */
export function computeSaleEndsAt(input: ComputeSaleEndsAtInput): ComputeSaleEndsAtResult {
  const tz = String(input.listingTimezone || '').trim()
  if (!tz || !isValidIanaTimeZoneId(tz)) {
    return { ok: false, reason: 'invalid_timezone' }
  }

  if (!parseYmd(input.date_start.trim())) return { ok: false, reason: 'invalid_date' }

  const effectiveEndYmdRaw = input.date_end?.trim() ? input.date_end.trim() : input.date_start.trim()
  if (!parseYmd(effectiveEndYmdRaw)) return { ok: false, reason: 'invalid_date' }

  const timeEndParsed = parseClockToHms(input.time_end)
  let hour: number
  let minute: number
  let second: number
  if (timeEndParsed) {
    hour = timeEndParsed.h
    minute = timeEndParsed.mi
    second = timeEndParsed.s
  } else {
    hour = 23
    minute = 59
    second = 59
  }

  const ms = utcMsForWallClock(effectiveEndYmdRaw, hour, minute, second, tz)
  if (ms == null) return { ok: false, reason: 'wall_clock_unresolvable' }

  return { ok: true, endsAtIso: new Date(ms).toISOString() }
}
