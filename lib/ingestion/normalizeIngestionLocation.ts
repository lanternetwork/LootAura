/**
 * US ingestion city/state display normalization (canonical pipeline).
 * No raw fields: use only on derived `city` / `state` columns, not address_raw or descriptions.
 */

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function titleCaseWord(word: string): string {
  if (!word) return word
  const lower = word.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function sanitizeCityArtifacts(value: string): string {
  let candidate = value
  const hasSlash = candidate.includes('/')
  if (hasSlash) {
    const segments = candidate.split('/').map((segment) => segment.trim()).filter(Boolean)
    const usIndex = segments.findIndex((segment) => segment.toUpperCase() === 'US')
    if (usIndex >= 0 && segments[usIndex + 2]) {
      candidate = segments[usIndex + 2]
    } else if (segments.length > 0) {
      candidate = segments[segments.length - 1]
    }
  }
  candidate = candidate
    .replace(/[?#].*$/, '')
    .replace(/\.(?:html?|php|aspx?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/[^\p{L}\p{M}'\s.-]/gu, ' ')
  return collapseWhitespace(candidate)
}

/**
 * Locality/city only (never pass a full street line). Expands URL-slug-style
 * letter–letter hyphens and Unicode dash punctuation for Nominatim queries.
 * Does not split digit-only or digit-mixed segments (e.g. route-style tokens).
 */
export function normalizeLocalityForGeocodeQuery(value: string | null): string | null {
  if (value == null) return null
  let s = collapseWhitespace(value.normalize('NFKC'))
  if (!s) return null
  s = s.replace(/\p{Pd}+/gu, ' ')
  s = collapseWhitespace(s)
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/([\p{L}\p{M}]+)-([\p{L}\p{M}]+)/gu, '$1 $2')
  }
  s = collapseWhitespace(s)
  return normalizeIngestionCity(s)
}

/**
 * First-pass geocode locality: trim, NFKC, collapse whitespace, strip trailing `.html` only.
 * No hyphen-to-space expansion (that stays on the fallback / `normalizeLocalityForGeocodeQuery` path).
 */
export function minimalNormalizeLocalityForPrimaryGeocode(value: string | null): string {
  if (value == null) return ''
  let s = value.normalize('NFKC').replace(/[?#].*$/, '').trim()
  s = collapseWhitespace(s).replace(/\.html?$/i, '')
  return collapseWhitespace(s)
}

/** Trim, collapse whitespace, naive title case per word. */
export function normalizeIngestionCity(value: string | null): string | null {
  if (value == null) return null
  const normalized = value.normalize('NFKC').replace(/\\+/g, '/')
  const collapsed = sanitizeCityArtifacts(collapseWhitespace(normalized))
  if (!collapsed) return null
  return collapsed.split(/\s+/).map(titleCaseWord).join(' ')
}

function stateKeyForLookup(collapsed: string): string {
  return collapsed
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(usa|us|united states|united states of america)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Two-letter abbrev → uppercase; full US state name → 2-letter code; unknown → uppercase (fallback).
 */
export function normalizeIngestionState(value: string | null): string | null {
  if (value == null) return null
  const collapsed = collapseWhitespace(value.normalize('NFKC'))
  if (!collapsed) return null
  if (/^[A-Za-z]{2}$/.test(collapsed)) {
    return collapsed.toUpperCase()
  }
  const key = stateKeyForLookup(collapsed)
  if (!key) return null
  if (key.length === 2 && /^[a-z]{2}$/.test(key)) {
    return key.toUpperCase()
  }
  return US_STATE_NAME_TO_CODE[key] ?? collapsed.toUpperCase()
}
