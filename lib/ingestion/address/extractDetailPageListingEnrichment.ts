import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import type { YstmNativeCoordinates } from '@/lib/ingestion/spatial/extractYstmNativeCoordinates'

export type DetailPageListingEnrichment = {
  addressRaw: string | null
  title: string | null
  description: string | null
  startDate?: string
  endDate?: string
  city: string | null
  state: string | null
  imageUrls: string[]
  nativeCoords: YstmNativeCoordinates | null
  detailTimeStart?: string
  detailTimeEnd?: string
  chosenAddressSource: 'ystm_detail_page' | null
}

/**
 * Parse a YSTM detail page for legacy enrichment paths (address worker, detail-first fallback).
 * Uses the same detail-native parser as detail-first ingestion.
 */
export function extractDetailPageListingEnrichmentFromHtml(input: {
  html: string
  sourceUrl: string
  city: string | null
  state: string | null
}): DetailPageListingEnrichment | null {
  const city = typeof input.city === 'string' && input.city.trim() ? input.city.trim() : null
  const state = typeof input.state === 'string' && input.state.trim() ? input.state.trim() : null
  if (!city || !state) {
    return null
  }

  const detailPage = parseYstmDetailPageFromHtml({
    html: input.html,
    sourceUrl: input.sourceUrl,
    configCity: city,
    configState: state,
  })
  if (!detailPage) {
    return null
  }

  return {
    addressRaw: detailPage.addressRaw?.trim() ? detailPage.addressRaw.trim() : null,
    title: detailPage.title,
    description: detailPage.description,
    startDate: detailPage.startDate,
    endDate: detailPage.endDate,
    city: detailPage.city,
    state: detailPage.state,
    imageUrls: detailPage.imageUrls,
    nativeCoords: detailPage.nativeCoords,
    detailTimeStart: detailPage.detailTimeStart,
    detailTimeEnd: detailPage.detailTimeEnd,
    chosenAddressSource: detailPage.addressRaw?.trim() ? 'ystm_detail_page' : null,
  }
}
