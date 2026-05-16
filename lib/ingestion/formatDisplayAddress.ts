/**
 * Presentation-only formatting for addresses written to published `sales.address`.
 * Does not run on ingest `normalized_address` or on dedupe/geocode inputs.
 */

const STREET_SUFFIXES: Record<string, string> = {
  st: 'St',
  ave: 'Ave',
  av: 'Av',
  blvd: 'Blvd',
  rd: 'Rd',
  dr: 'Dr',
  ln: 'Ln',
  ct: 'Ct',
  cir: 'Cir',
  pl: 'Pl',
  pkwy: 'Pkwy',
  pkway: 'Pkwy',
  hwy: 'Hwy',
  way: 'Way',
  ter: 'Ter',
  trl: 'Trl',
  cres: 'Cres',
  route: 'Route',
  rte: 'Rte',
}

const DIRECTIONALS: Record<string, string> = {
  n: 'N',
  s: 'S',
  e: 'E',
  w: 'W',
  ne: 'NE',
  nw: 'NW',
  se: 'SE',
  sw: 'SW',
}

function stripTrailingPeriod(token: string): { base: string; hadPeriod: boolean } {
  if (token.endsWith('.')) {
    return { base: token.slice(0, -1), hadPeriod: true }
  }
  return { base: token, hadPeriod: false }
}

function formatStreetSegment(segment: string): string {
  const tokens = segment.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const raw = tokens[i]!
    if (/^\d+[A-Za-z0-9-]*$/.test(raw)) {
      out.push(raw)
      i += 1
      continue
    }
    if (/^P\.?O\.?$/i.test(raw) && tokens[i + 1] && /^Box\.?$/i.test(tokens[i + 1]!)) {
      out.push('PO')
      const boxTok = tokens[i + 1]!
      out.push(/^Box\.?$/i.test(boxTok) ? 'Box' : boxTok)
      i += 2
      continue
    }
    const { base, hadPeriod } = stripTrailingPeriod(raw)
    const lower = base.toLowerCase()
    if (DIRECTIONALS[lower]) {
      out.push(DIRECTIONALS[lower])
      i += 1
      continue
    }
    const suf = STREET_SUFFIXES[lower]
    if (suf) {
      out.push(suf)
      i += 1
      continue
    }
    const inner = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase()
    out.push(hadPeriod ? `${inner}.` : inner)
    i += 1
  }
  return out.join(' ')
}

function formatCityOrRegionSegment(segment: string): string {
  return segment
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^\d/.test(w)) return w
      if (/^[A-Za-z]{2}$/.test(w)) return w.toUpperCase()
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Human-friendly title case for a full published address line (street + city, state ZIP).
 * Safe to call only after publish-time address validation.
 */
export function formatAddressForPublishedSaleDisplay(address: string): string {
  const norm = address.replace(/\s+/g, ' ').trim()
  if (!norm) return norm

  const segments = norm.split(',').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return norm

  const first = formatStreetSegment(segments[0]!)
  if (segments.length === 1) return first

  const rest = segments.slice(1)
  const last = rest[rest.length - 1]!
  const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/)

  if (stateZip) {
    const middle = rest.slice(0, -1).map(formatCityOrRegionSegment)
    const tail = `${stateZip[1]!.toUpperCase()} ${stateZip[2]!}`
    return [first, ...middle, tail].join(', ')
  }

  return [first, ...rest.map(formatCityOrRegionSegment)].join(', ')
}
