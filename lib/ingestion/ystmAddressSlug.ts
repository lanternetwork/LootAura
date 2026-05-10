import { parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'

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
