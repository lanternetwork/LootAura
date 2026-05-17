import { normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'

const DIRECTIONAL_MAP: Record<string, string> = {
  n: 'N',
  s: 'S',
  e: 'E',
  w: 'W',
  ne: 'NE',
  nw: 'NW',
  se: 'SE',
  sw: 'SW',
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
}

const HWY_RE = /\b(hwy|hwys|highway|highways|sr|state\s+route|rt|route)\b/gi

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Expand trailing directional tokens on street segments (deterministic). */
function normalizeDirectionals(segment: string): string {
  const parts = segment.split(/\s+/)
  if (parts.length < 2) return segment
  const last = parts[parts.length - 1]!.toLowerCase().replace(/\./g, '')
  const mapped = DIRECTIONAL_MAP[last]
  if (!mapped) return segment
  parts[parts.length - 1] = mapped
  return parts.join(' ')
}

export function isIntersectionOrHighwayLine(addressLine: string): boolean {
  const s = normalizeWhitespace(addressLine)
  if (!s) return false
  if (/\s&\s/.test(s) || /\s+and\s+/i.test(s) || /\bcorner\s+of\b/i.test(s) || /\s@\s/.test(s)) {
    return true
  }
  return HWY_RE.test(s)
}

export function normalizeIntersectionHighwayLine(addressLine: string): string {
  let s = normalizeWhitespace(addressLine)
  s = s.replace(/\bhighway\b/gi, 'Highway')
  s = s.replace(/\bhwy\.?\b/gi, 'Highway')
  s = s.replace(/\bsr\.?\b/gi, 'State Route')
  s = s.replace(/\broute\b/gi, 'Route')
  s = s.replace(/\s+and\s+/gi, ' & ')
  s = s.replace(/\bcorner\s+of\s+/gi, '')
  s = s.replace(/\s@\s/g, ' & ')
  return normalizeWhitespace(s)
}

/** Deterministic pre-provider normalization for geocode query assembly. */
export function normalizeGeocodeAddressLine(addressLine: string): string {
  const parts = normalizeWhitespace(addressLine)
    .split(',')
    .map((p) => normalizeWhitespace(p))
    .filter(Boolean)
  if (parts.length === 0) return ''
  parts[0] = normalizeDirectionals(parts[0]!)
  const joined = parts.join(', ')
  return isIntersectionOrHighwayLine(joined) ? normalizeIntersectionHighwayLine(joined) : joined
}

const ZIP_TAIL_RE = /(?:,\s*)?([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i

export function stripZipFromAddressLine(addressLine: string, stateHint: string): string | null {
  const trimmed = normalizeWhitespace(addressLine)
  if (!trimmed) return null
  const m = trimmed.match(ZIP_TAIL_RE)
  if (!m) return null
  const st = normalizeIngestionState(m[1] ?? '')
  const hint = normalizeIngestionState(stateHint)
  if (st && hint && st !== hint) return null
  const without = trimmed.replace(ZIP_TAIL_RE, (_, stPart: string) => `, ${stPart}`).trim()
  return without !== trimmed ? without : null
}

export function hasUsZipInAddressLine(addressLine: string, stateHint: string): boolean {
  return stripZipFromAddressLine(addressLine, stateHint) != null
}
