import { extractDetailPageListingEnrichmentFromHtml } from '@/lib/ingestion/address/extractDetailPageListingEnrichment'

export type DetailPageAddressExtraction = {
  addressRaw: string | null
}

/**
 * Extract address_raw from YSTM detail/list HTML via the detail-native parser.
 */
export function extractDetailPageAddressFromHtml(input: {
  html: string
  sourceUrl: string
  city: string | null
  state: string | null
  sourcePlatform: string
}): DetailPageAddressExtraction {
  void input.sourcePlatform
  const enrichment = extractDetailPageListingEnrichmentFromHtml({
    html: input.html,
    sourceUrl: input.sourceUrl,
    city: input.city,
    state: input.state,
  })
  return { addressRaw: enrichment?.addressRaw ?? null }
}
