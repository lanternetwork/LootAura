import type {
  ExternalPageSourceIngestionConfig,
  ExternalPageSourceListing,
} from '@/lib/ingestion/adapters/externalPageSource'
import { extractYstmSourceListingId } from '@/lib/ingestion/identity/ystmSourceListingId'
import { getYstmPathMunicipalityPreview, parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'

const ADAPTER_ID = 'external_page_source'
const PARSER_VERSION_ROW = 'external_page_source_mvp_v3'

export type CoverageMissingObservationRow = {
  canonicalUrl: string
  city: string | null
  state: string | null
}

function titleFromListingUrl(url: string): string {
  const parsed = parseYstmListingPathParts(url)
  if (!parsed?.addressSlugSegment) return 'YSTM yard sale'
  return parsed.addressSlugSegment.replace(/-/g, ' ')
}

export function buildCoverageMissingIngestionContext(
  row: CoverageMissingObservationRow
): {
  config: ExternalPageSourceIngestionConfig
  listSeed: ExternalPageSourceListing
  rowPayload: Record<string, unknown>
} {
  const pathPreview = getYstmPathMunicipalityPreview(row.canonicalUrl)
  const city = (row.city?.trim() || pathPreview.city || 'Unknown').trim()
  const state = (row.state?.trim() || pathPreview.state || 'XX').trim()
  const externalId = extractYstmSourceListingId(row.canonicalUrl)

  const listSeed: ExternalPageSourceListing = {
    title: titleFromListingUrl(row.canonicalUrl),
    description: null,
    addressRaw: null,
    city,
    state,
    sourceUrl: row.canonicalUrl,
    imageSourceUrl: null,
    rawPayload: {
      adapter: ADAPTER_ID,
      externalId,
      coverageMissingIngest: true,
    },
  }

  return {
    config: {
      city,
      state,
      source_platform: ADAPTER_ID,
      source_pages: [row.canonicalUrl],
    },
    listSeed,
    rowPayload: {
      adapter: ADAPTER_ID,
      parser_version: PARSER_VERSION_ROW,
      page_index: 0,
      page_host_hash: null,
      coverage_missing_ingest: true,
      extractedFields: {
        externalId,
      },
    },
  }
}
