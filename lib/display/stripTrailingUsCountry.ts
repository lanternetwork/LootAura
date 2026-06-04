/**
 * Removes a trailing US country suffix from a comma-delimited address line.
 * Only the final segment is considered — never strips "USA" embedded in street names.
 */

const TRAILING_US_COUNTRY_SEGMENT =
  /^(?:USA|U\.S\.A\.|U\.S\.|United States(?: of America)?)$/i

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function stripTrailingUsCountryFromAddressLine(address: string): string {
  const norm = normalizeWhitespace(address)
  if (!norm) return norm

  const segments = norm.split(',').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return norm

  const last = segments[segments.length - 1]!
  if (!TRAILING_US_COUNTRY_SEGMENT.test(last)) {
    return norm
  }

  segments.pop()
  if (segments.length === 0) return ''
  return segments.join(', ')
}
