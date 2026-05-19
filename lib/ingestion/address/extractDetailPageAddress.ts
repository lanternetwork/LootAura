import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { enrichStreetLineWithPathMunicipalityWhenNoTail } from '@/lib/ingestion/ystmAddressSlug'

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
  const city = typeof input.city === 'string' && input.city.trim() ? input.city.trim() : null
  const state = typeof input.state === 'string' && input.state.trim() ? input.state.trim() : null
  if (!city || !state) {
    return { addressRaw: null }
  }

  const detailPage = parseYstmDetailPageFromHtml({
    html: input.html,
    sourceUrl: input.sourceUrl,
    configCity: city,
    configState: state,
  })

  const line = detailPage?.addressRaw?.trim() ?? null
  if (!line) {
    return { addressRaw: null }
  }

  const enriched = enrichStreetLineWithPathMunicipalityWhenNoTail(line, input.sourceUrl)
  return { addressRaw: enriched.line }
}
