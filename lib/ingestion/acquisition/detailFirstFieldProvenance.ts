import type { ExternalPageSourceListing } from '@/lib/ingestion/adapters/externalPageSource'
import type { YstmDetailPageParsed } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { coerceIngestedDateToYyyyMmDd } from '@/lib/ingestion/saleWindowDates'

export type DetailFirstFieldSource = 'detail_page' | 'list_seed'

export type DetailFirstFieldProvenance = {
  title: DetailFirstFieldSource
  description: DetailFirstFieldSource
  addressRaw: DetailFirstFieldSource
  city: DetailFirstFieldSource
  state: DetailFirstFieldSource
  startDate: DetailFirstFieldSource | 'none'
  endDate: DetailFirstFieldSource | 'none'
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function pickDetailOrSeed(
  detailValue: string | null | undefined,
  seedValue: string | null | undefined
): { value: string | null | undefined; source: DetailFirstFieldSource } {
  if (hasText(detailValue)) {
    return { value: detailValue, source: 'detail_page' }
  }
  if (hasText(seedValue)) {
    return { value: seedValue, source: 'list_seed' }
  }
  return { value: detailValue ?? seedValue, source: 'list_seed' }
}

function pickDetailOrSeedDate(
  detailValue: string | undefined,
  seedValue: string | undefined
): { value: string | undefined; source: DetailFirstFieldSource | 'none' } {
  if (detailValue != null && coerceIngestedDateToYyyyMmDd(detailValue) != null) {
    return { value: detailValue, source: 'detail_page' }
  }
  if (seedValue != null && coerceIngestedDateToYyyyMmDd(seedValue) != null) {
    return { value: seedValue, source: 'list_seed' }
  }
  return { value: undefined, source: 'none' }
}

/**
 * Record which listing fields came from the detail page vs list seed after merge.
 */
export function buildDetailFirstFieldProvenance(
  detailPage: YstmDetailPageParsed,
  listSeed: ExternalPageSourceListing
): DetailFirstFieldProvenance {
  const title = pickDetailOrSeed(detailPage.title, listSeed.title)
  const description = pickDetailOrSeed(detailPage.description, listSeed.description)
  const addressRaw = pickDetailOrSeed(detailPage.addressRaw, listSeed.addressRaw)
  const city = pickDetailOrSeed(detailPage.city, listSeed.city)
  const state = pickDetailOrSeed(detailPage.state, listSeed.state)
  const startDate = pickDetailOrSeedDate(detailPage.startDate, listSeed.startDate)
  const endDate = pickDetailOrSeedDate(detailPage.endDate, listSeed.endDate)

  return {
    title: title.source,
    description: description.source,
    addressRaw: addressRaw.source,
    city: city.source,
    state: state.source,
    startDate: startDate.source,
    endDate: endDate.source,
  }
}

export function chosenAddressSourceForDetailFirst(
  provenance: DetailFirstFieldProvenance,
  listSeedDiagnostics: Record<string, unknown> | undefined
): string {
  if (provenance.addressRaw === 'detail_page') {
    return 'ystm_detail_page'
  }
  const seedChosen = listSeedDiagnostics?.chosenAddressSource
  return typeof seedChosen === 'string' && seedChosen.trim() ? seedChosen.trim() : 'none'
}

export function mergeIngestionDiagnosticsForDetailFirst(
  listSeed: ExternalPageSourceListing,
  provenance: DetailFirstFieldProvenance,
  validatedListing: ExternalPageSourceListing
): Record<string, unknown> {
  const seedDiag =
    typeof listSeed.rawPayload === 'object' && listSeed.rawPayload?.ingestionDiagnostics
      ? (listSeed.rawPayload.ingestionDiagnostics as Record<string, unknown>)
      : {}

  return {
    ...seedDiag,
    chosenAddressSource: chosenAddressSourceForDetailFirst(provenance, seedDiag),
    detailFirstValidated: true,
    detailFirstFieldProvenance: provenance,
    listSeedAddressRaw: listSeed.addressRaw ?? null,
    validatedAddressRaw: validatedListing.addressRaw ?? null,
  }
}

export function dateSourceForDetailFirst(provenance: DetailFirstFieldProvenance): string | null {
  if (provenance.startDate === 'detail_page' || provenance.endDate === 'detail_page') {
    return 'ystm_detail_page'
  }
  if (provenance.startDate === 'list_seed' || provenance.endDate === 'list_seed') {
    return 'external_list_page'
  }
  return null
}

export function readDetailFirstFieldProvenance(
  listing: ExternalPageSourceListing
): DetailFirstFieldProvenance | null {
  const raw = listing.rawPayload as { detailFirstFieldProvenance?: DetailFirstFieldProvenance }
  return raw.detailFirstFieldProvenance ?? null
}

export function detailScheduleFieldsForListing(
  listing: ExternalPageSourceListing
): {
  date_source: string | null
  time_start: string | null
  time_end: string | null
  time_source: string | null
} {
  const timePayload = listing.rawPayload as { detailTimeStart?: string; detailTimeEnd?: string }
  const provenance = readDetailFirstFieldProvenance(listing)
  return {
    date_source: provenance
      ? dateSourceForDetailFirst(provenance)
      : listing.startDate
        ? 'external_list_page'
        : null,
    time_start: timePayload.detailTimeStart ?? null,
    time_end: timePayload.detailTimeEnd ?? null,
    time_source: timePayload.detailTimeStart ? 'ystm_detail_page' : null,
  }
}
