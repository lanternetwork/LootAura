import {
  extractAddressTailCityState,
  getYstmPathMunicipalityPreview,
  parseYstmListingPathParts,
} from '@/lib/ingestion/ystmListingCityAuthority'

/** Decode YSTM listing path address slug to a single-line street string (hyphens → spaces). */
export function slugSegmentToAddressLine(segment: string): string | null {
  const decoded = decodeURIComponent(segment).trim()
  if (!decoded) return null
  if (/^see-source-for-address/i.test(decoded)) {
    return null
  }
  return decoded.replace(/-/g, ' ')
}

/** Street line from `/US/.../.../address-slug/.../listing.html` when present. */
export function addressLineFromYstmListingUrlSlug(listingUrl: string): string | null {
  const parsed = parseYstmListingPathParts(listingUrl)
  if (!parsed?.addressSlugSegment) return null
  return slugSegmentToAddressLine(parsed.addressSlugSegment)
}

/**
 * When the line is a concrete numbered street but has no `, City, ST` tail, append URL path
 * municipality + state so Nominatim has a locality (cron + upload).
 */
export function enrichStreetLineWithPathMunicipalityWhenNoTail(
  streetLine: string | null,
  listingUrl: string
): { line: string | null; appended: boolean } {
  const trimmed = streetLine?.trim() || null
  if (!trimmed || !listingUrl) return { line: trimmed, appended: false }
  const tail = extractAddressTailCityState(trimmed)
  if (tail.addressTailCity && tail.addressTailState) {
    return { line: trimmed, appended: false }
  }
  /** Match processSale `hasStreetNumberAndName`: slug-only lines need municipality for geocode. */
  if (!/^\s*\d+\s+.+/.test(trimmed)) {
    return { line: trimmed, appended: false }
  }
  const preview = getYstmPathMunicipalityPreview(listingUrl)
  if (!preview.city || !preview.state) return { line: trimmed, appended: false }
  return { line: `${trimmed}, ${preview.city}, ${preview.state}`, appended: true }
}
