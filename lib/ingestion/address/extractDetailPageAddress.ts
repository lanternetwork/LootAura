import { parseExternalPageSourceHtml } from '@/lib/ingestion/adapters/externalPageSource'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { enrichStreetLineWithPathMunicipalityWhenNoTail } from '@/lib/ingestion/ystmAddressSlug'

export type DetailPageAddressExtraction = {
  addressRaw: string | null
}

/**
 * D1: extract address_raw only from refreshed detail/list HTML (no dates/images/seller).
 */
export function extractDetailPageAddressFromHtml(input: {
  html: string
  sourceUrl: string
  city: string | null
  state: string | null
  sourcePlatform: string
}): DetailPageAddressExtraction {
  const city = typeof input.city === 'string' && input.city.trim() ? input.city.trim() : null
  const state = typeof input.state === 'string' && input.state.trim() ? input.state.trim() : null
  if (!city || !state) {
    return { addressRaw: null }
  }

  const { listings } = parseExternalPageSourceHtml(
    input.html,
    {
      city,
      state,
      source_platform: input.sourcePlatform,
      source_pages: [],
    },
    input.sourceUrl
  )

  const target = canonicalSourceUrl(input.sourceUrl)
  const match =
    listings.find((l) => canonicalSourceUrl(l.sourceUrl) === target) ??
    (listings.length === 1 ? listings[0] : null)

  if (!match?.addressRaw?.trim()) {
    return { addressRaw: null }
  }

  const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(match.addressRaw.trim(), input.sourceUrl)
  return { addressRaw: enriched.line }
}
