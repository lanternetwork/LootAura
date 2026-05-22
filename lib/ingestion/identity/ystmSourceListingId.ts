import { parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'

/**
 * YSTM numeric listing segment from detail URL path (e.g. `/961002738/listing.html`).
 */
export function extractYstmSourceListingId(sourceUrl: string): string | null {
  const parsed = parseYstmListingPathParts(sourceUrl)
  if (!parsed) return null
  const idx = parsed.parts.findIndex((p) => /^\d+$/.test(p))
  if (idx < 0) return null
  return parsed.parts[idx] ?? null
}
