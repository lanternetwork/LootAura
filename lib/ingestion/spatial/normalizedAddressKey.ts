/** Stable cache key: normalized line + city + USPS state (no PII in logs). */
export function buildNormalizedAddressKey(input: {
  addressRaw?: string | null
  normalizedAddress?: string | null
  city: string
  state: string
}): string | null {
  const line = (input.normalizedAddress ?? input.addressRaw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  const city = input.city.trim().toLowerCase().replace(/\s+/g, ' ')
  const state = input.state.trim().toUpperCase()
  if (!line || !city || state.length !== 2) return null
  return `${line}|${city}|${state}`
}
