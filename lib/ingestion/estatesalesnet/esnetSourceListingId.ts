import { isEstatesalesNetSourceUrl } from '@/lib/ingestion/estatesalesnet/esnetHosts'

/** Numeric sale id from canonical ES.net detail URL (last path segment). */
export function extractEsnetSourceListingId(sourceUrl: string): string | null {
  if (!isEstatesalesNetSourceUrl(sourceUrl)) return null
  try {
    const parts = new URL(sourceUrl.trim()).pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1]
    if (last && /^\d+$/.test(last)) return last
  } catch {
    return null
  }
  return null
}
