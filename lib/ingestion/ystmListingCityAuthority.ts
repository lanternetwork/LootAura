/**
 * Single policy for YSTM-style listing URLs: `/US/{State}/{CitySlug-or-Hub}/.../listing.html`.
 * Listing URL municipality wins over trailing `..., City, ST` on address_raw when they disagree.
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
  citySource: YstmCitySource
  stateSource: YstmStateSource
  resolvedCity: string | null
  resolvedState: string | null
}

const ADDRESS_TAIL_RE = /,\s*([^,]+?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*USA)?$/i

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

  const resolvedCity = urlCity ?? addrCity ?? null
  const resolvedState = pathStateNormalized ?? addrState ?? null

  const citySource: YstmCitySource = urlCity ? 'listing_url' : addrCity ? 'address_tail' : 'none'
  const stateSource: YstmStateSource = pathStateNormalized
    ? 'listing_url'
    : addrState
      ? 'address_tail'
      : 'none'

  return {
    isYstmPath: true,
    pathCitySlug: parsed.pathCitySlugRaw,
    hubSegment: parsed.hubSegment,
    urlMunicipalityNormalized: urlCity,
    pathStateNormalized,
    addressTailCity: addrCity,
    addressTailState: addrState,
    cityConflict,
    citySource,
    stateSource,
    resolvedCity,
    resolvedState,
  }
}
