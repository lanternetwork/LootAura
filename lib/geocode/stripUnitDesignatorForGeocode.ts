function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Trailing secondary address on the first comma segment only (street line).
 * Matches: Unit/Apt/Apartment/Suite/Ste + unit id, or # + unit id (case-insensitive).
 * Does not scan city/state/ZIP segments.
 */
const UNIT_DESIGNATOR_TAIL_RE =
  /\s+(?:(?:apartment|apt|unit|suite|ste)\s+[A-Za-z0-9-]+|#\s*[A-Za-z0-9-]+)$/iu

export function addressLineHasUnitDesignatorForGeocode(addressLine: string): boolean {
  const parts = normalizeWhitespace(addressLine)
    .split(',')
    .map((p) => normalizeWhitespace(p))
    .filter(Boolean)
  if (parts.length === 0) return false
  return UNIT_DESIGNATOR_TAIL_RE.test(parts[0])
}

/**
 * Returns null when no unit designator tail was removed from the first segment.
 */
export function stripUnitDesignatorFromAddressLineForGeocode(addressLine: string): string | null {
  const trimmed = normalizeWhitespace(addressLine)
  if (!trimmed) return null
  const parts = trimmed.split(',').map((p) => normalizeWhitespace(p)).filter(Boolean)
  if (parts.length === 0) return null
  const first = parts[0]
  const strippedFirst = first.replace(UNIT_DESIGNATOR_TAIL_RE, '').trim()
  if (!strippedFirst || strippedFirst === first) return null
  return [strippedFirst, ...parts.slice(1)].join(', ')
}
