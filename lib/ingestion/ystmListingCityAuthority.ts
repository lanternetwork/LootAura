/**
 * Single policy for YSTM-style listing URLs: `/US/{State}/{CitySlug-or-Hub}/.../listing.html`.
 *
 * Precedence when URL municipality disagrees with trailing `..., City, ST` on the address:
 * - If the street line before that tail is concrete (leading house number + remainder), prefer the
 *   address-tail city/state (source-address / hidden-address listings where the path hub is wrong).
 * - Otherwise prefer the URL municipality (tail missing or low-confidence street).
 */

import { normalizeIngestionCity, normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'

export type YstmCitySource = 'listing_url' | 'address_tail' | 'none'
export type YstmStateSource = 'listing_url' | 'address_tail' | 'none'

export type YstmListingCityAuthorityResult = {
  isYstmPath: boolean
  pathCitySlug: string | null
  hubSegment: string | null
  urlMunicipalityNormalized: string | null
  pathStateNormalized: string | null
  addressTailCity: string | null
  addressTailState: string | null
  cityConflict: boolean
  /** True when trailing `, City, ST` exists and the pre-tail line matches `^\\s*\\d+\\s+.+`. */
  streetConcrete: boolean
  citySource: YstmCitySource
  stateSource: YstmStateSource
  resolvedCity: string | null
  resolvedState: string | null
}

const ADDRESS_TAIL_RE = /,\s*([^,]+?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*USA)?$/i

/** True when text before the trailing `, City, ST` starts with a house number and has street detail. */
export function hasConcreteStreetLineBeforeAddressTail(addressRaw: string | null): boolean {
  if (!addressRaw?.trim()) return false
  const m = addressRaw.match(ADDRESS_TAIL_RE)
  if (!m || typeof m.index !== 'number' || m.index === 0) return false
  const streetPart = addressRaw.slice(0, m.index).trim()
  return /^\s*\d+\s+.+/.test(streetPart)
}

export function extractAddressTailCityState(addressRaw: string | null): {
  addressTailCity: string | null
  addressTailState: string | null
} {
  if (!addressRaw) return { addressTailCity: null, addressTailState: null }
  const match = addressRaw.match(ADDRESS_TAIL_RE)
  if (!match) return { addressTailCity: null, addressTailState: null }
  return {
    addressTailCity: normalizeIngestionCity(match[1] ?? null),
    addressTailState: normalizeIngestionState(match[2] ?? null),
  }
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** After a hub `*.html` segment, parts[3] may be a real city slug or a street / placeholder slug. */
function isLikelyNonCityPathSegment(segment: string): boolean {
  const s = decodePathSegment(segment)
  if (/^\d/.test(s)) return true
  if (/see-?source/i.test(s)) return true
  if (/address-after/i.test(s)) return true
  if (s.length > 48) return true
  return false
}

function hubBaseSlug(hubSegment: string): string {
  return hubSegment.replace(/\.html?$/i, '')
}

/**
 * Parses YSTM listing pathname: US state segment, municipality slug (with hub handling), and address slug index.
 */
export function parseYstmListingPathParts(listingUrl: string): {
  parts: string[]
  pathCitySlugRaw: string | null
  hubSegment: string | null
  pathStateSegment: string | null
  addressSlugSegment: string | null
} | null {
  let urlObj: URL
  try {
    urlObj = new URL(listingUrl)
  } catch {
    return null
  }
  const parts = urlObj.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'US' || parts.length < 6) return null

  const pathStateSegment = parts[1] ?? null
  const seg2 = parts[2] ?? ''
  let hubSegment: string | null = null
  let pathCitySlugRaw: string | null = null
  let addressIdx: number

  if (/\.html?$/i.test(seg2) && parts[3]) {
    hubSegment = seg2
    const cand = parts[3]
    if (!isLikelyNonCityPathSegment(cand)) {
      pathCitySlugRaw = cand
      addressIdx = 4
    } else {
      pathCitySlugRaw = hubBaseSlug(seg2)
      addressIdx = 3
    }
  } else if (seg2) {
    pathCitySlugRaw = seg2
    addressIdx = 3
  } else {
    return null
  }

  const addressSlugSegment = parts[addressIdx] ?? null
  return { parts, pathCitySlugRaw, hubSegment, pathStateSegment, addressSlugSegment }
}

/**
 * URL municipality + state from the listing path only (no address line).
 * Always normalizes city so `.html` hub segments never leak (e.g. Chicago.html → Chicago).
 */
export function getYstmPathMunicipalityPreview(listingUrl: string): {
  city: string | null
  state: string | null
} {
  const parsed = parseYstmListingPathParts(listingUrl)
  if (!parsed) return { city: null, state: null }
  const pathStateNormalized = normalizeIngestionState(parsed.pathStateSegment?.replace(/-/g, ' ') ?? null)
  const urlMunicipalityNormalized = normalizeIngestionCity(parsed.pathCitySlugRaw)
  return { city: urlMunicipalityNormalized, state: pathStateNormalized }
}

export function resolveYstmListingCityAuthority(
  listingUrl: string,
  addressRaw: string | null
): YstmListingCityAuthorityResult {
  const tail = extractAddressTailCityState(addressRaw)
  const parsed = parseYstmListingPathParts(listingUrl)

  if (!parsed) {
    const hasTail = Boolean(tail.addressTailCity && tail.addressTailState)
    return {
      isYstmPath: false,
      pathCitySlug: null,
      hubSegment: null,
      urlMunicipalityNormalized: null,
      pathStateNormalized: null,
      addressTailCity: tail.addressTailCity,
      addressTailState: tail.addressTailState,
      cityConflict: false,
      streetConcrete: hasConcreteStreetLineBeforeAddressTail(addressRaw),
      citySource: hasTail ? 'address_tail' : 'none',
      stateSource: hasTail ? 'address_tail' : 'none',
      resolvedCity: tail.addressTailCity,
      resolvedState: tail.addressTailState,
    }
  }

  const pathStateNormalized = normalizeIngestionState(parsed.pathStateSegment?.replace(/-/g, ' ') ?? null)
  const urlMunicipalityNormalized = normalizeIngestionCity(parsed.pathCitySlugRaw)

  const urlCity = urlMunicipalityNormalized
  const addrCity = tail.addressTailCity
  const addrState = tail.addressTailState

  const cityConflict = Boolean(urlCity && addrCity && urlCity !== addrCity)
  const streetConcrete = hasConcreteStreetLineBeforeAddressTail(addressRaw)

  let resolvedCity: string | null
  let resolvedState: string | null
  let citySource: YstmCitySource
  let stateSource: YstmStateSource

  if (cityConflict && streetConcrete && addrCity && addrState) {
    resolvedCity = addrCity
    resolvedState = addrState
    citySource = 'address_tail'
    stateSource = 'address_tail'
  } else {
    resolvedCity = urlCity ?? addrCity ?? null
    resolvedState = pathStateNormalized ?? addrState ?? null
    citySource = urlCity ? 'listing_url' : addrCity ? 'address_tail' : 'none'
    stateSource = pathStateNormalized ? 'listing_url' : addrState ? 'address_tail' : 'none'
  }

  return {
    isYstmPath: true,
    pathCitySlug: parsed.pathCitySlugRaw,
    hubSegment: parsed.hubSegment,
    urlMunicipalityNormalized: urlCity,
    pathStateNormalized,
    addressTailCity: addrCity,
    addressTailState: addrState,
    cityConflict,
    streetConcrete,
    citySource,
    stateSource,
    resolvedCity,
    resolvedState,
  }
}
