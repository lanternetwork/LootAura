import { CRAWL_SKIP_DATE_TOLERANCE_DAYS } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import type { SaleInstanceIdentityFields } from '@/lib/ingestion/identity/saleInstanceIdentityTypes'
import { calendarDaysBetweenUtc } from '@/lib/ingestion/duplicateScoring'
import type { YstmCoverageLootAuraMatchIndex } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageLootAuraMatchIndex'

export const YSTM_COVERAGE_FOOTPRINT_MATCH_METHODS = [
  'sale_instance_key',
  'source_listing_id_date_overlap',
  'source_url_alias',
  'source_url_visible',
  'normalized_address_date',
] as const

export type YstmCoverageFootprintMatchMethod =
  (typeof YSTM_COVERAGE_FOOTPRINT_MATCH_METHODS)[number]

export type YstmCoverageFootprintMatchInput = {
  canonicalUrl: string
  saleInstanceKey: string | null
  sourceListingId: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  identity: SaleInstanceIdentityFields | null
}

export type YstmCoverageFootprintMatchResult = {
  lootauraVisible: boolean
  matchMethod: YstmCoverageFootprintMatchMethod | null
  matchedIngestedSaleId: string | null
  matchedSaleId: string | null
  sourceListingId: string | null
  saleInstanceKey: string | null
}

function normalizeAddressLine(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
}

function datesBeyondTolerance(incomingStart: string | null, existingStart: string | null): boolean {
  if (!incomingStart?.trim() || !existingStart?.trim()) return false
  return (
    calendarDaysBetweenUtc(incomingStart.trim(), existingStart.trim()) >
    CRAWL_SKIP_DATE_TOLERANCE_DAYS
  )
}

function dateWindowsOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  if (!aStart?.trim() || !bStart?.trim()) return false
  if (datesBeyondTolerance(aStart, bStart)) return false
  const aEndVal = aEnd?.trim() || aStart
  const bEndVal = bEnd?.trim() || bStart
  return calendarDaysBetweenUtc(aEndVal, bEndVal) <= CRAWL_SKIP_DATE_TOLERANCE_DAYS
}

function instanceAgreesWithFootprint(
  input: YstmCoverageFootprintMatchInput,
  row: {
    saleInstanceKey: string | null
    sourceListingId: string | null
    dateStart: string | null
    dateEnd: string | null
  }
): boolean {
  const key = input.saleInstanceKey?.trim()
  if (key && row.saleInstanceKey?.trim() === key) return true

  const listingId = input.sourceListingId?.trim()
  if (
    listingId &&
    row.sourceListingId?.trim() === listingId &&
    dateWindowsOverlap(input.dateStart, input.dateEnd, row.dateStart, row.dateEnd)
  ) {
    return true
  }

  return !key && !listingId
}

function buildVisibleMatch(
  row: {
    saleId: string
    ingestedSaleId: string | null
    saleInstanceKey: string | null
    sourceListingId: string | null
  },
  matchMethod: YstmCoverageFootprintMatchMethod,
  input: YstmCoverageFootprintMatchInput
): YstmCoverageFootprintMatchResult {
  return {
    lootauraVisible: true,
    matchMethod,
    matchedIngestedSaleId: row.ingestedSaleId,
    matchedSaleId: row.saleId,
    sourceListingId: input.sourceListingId ?? row.sourceListingId,
    saleInstanceKey: input.saleInstanceKey ?? row.saleInstanceKey,
  }
}

function matchByNormalizedAddress(
  index: YstmCoverageLootAuraMatchIndex,
  input: YstmCoverageFootprintMatchInput
): YstmCoverageFootprintMatchResult | null {
  const address = normalizeAddressLine(input.normalizedAddress)
  const dateStart = input.dateStart?.trim()
  if (!address || !dateStart) return null

  const candidates = index.byNormalizedAddress.get(address) ?? []
  for (const row of candidates) {
    if (datesBeyondTolerance(dateStart, row.dateStart)) continue
    return buildVisibleMatch(row, 'normalized_address_date', input)
  }
  return null
}

function matchByUrlFootprint(
  index: YstmCoverageLootAuraMatchIndex,
  input: YstmCoverageFootprintMatchInput,
  method: 'source_url_alias' | 'source_url_visible',
  rows: Array<{
    saleId: string
    ingestedSaleId: string | null
    saleInstanceKey: string | null
    sourceListingId: string | null
    dateStart: string | null
    dateEnd: string | null
  }>
): YstmCoverageFootprintMatchResult | null {
  for (const row of rows) {
    if (instanceAgreesWithFootprint(input, row)) {
      return buildVisibleMatch(row, method, input)
    }
  }
  return null
}

/**
 * Phase 11: determine whether a YSTM audit URL is covered by a visible LootAura sale instance.
 * URL-only matches require instance agreement when identity fields are known.
 */
export function matchYstmCoverageLootAuraFootprint(
  index: YstmCoverageLootAuraMatchIndex,
  input: YstmCoverageFootprintMatchInput
): YstmCoverageFootprintMatchResult {
  const saleInstanceKey = input.saleInstanceKey?.trim() || input.identity?.sale_instance_key?.trim() || null
  const sourceListingId =
    input.sourceListingId?.trim() || input.identity?.source_listing_id?.trim() || null
  const enrichedInput: YstmCoverageFootprintMatchInput = {
    ...input,
    saleInstanceKey,
    sourceListingId,
  }

  if (saleInstanceKey) {
    const row = index.bySaleInstanceKey.get(saleInstanceKey)
    if (row) {
      return buildVisibleMatch(row, 'sale_instance_key', enrichedInput)
    }
  }

  if (sourceListingId) {
    const candidates = index.bySourceListingId.get(sourceListingId) ?? []
    for (const row of candidates) {
      if (
        dateWindowsOverlap(
          enrichedInput.dateStart,
          enrichedInput.dateEnd,
          row.dateStart,
          row.dateEnd
        )
      ) {
        return buildVisibleMatch(row, 'source_listing_id_date_overlap', enrichedInput)
      }
    }
  }

  const aliasMatch = matchByUrlFootprint(
    index,
    enrichedInput,
    'source_url_alias',
    index.visibleAliasByCanonical.get(enrichedInput.canonicalUrl) ?? []
  )
  if (aliasMatch) return aliasMatch

  const directRows = index.visibleByCanonicalUrl.get(enrichedInput.canonicalUrl)
    ? [index.visibleByCanonicalUrl.get(enrichedInput.canonicalUrl)!]
    : []
  const urlMatch = matchByUrlFootprint(index, enrichedInput, 'source_url_visible', directRows)
  if (urlMatch) return urlMatch

  const addressMatch = matchByNormalizedAddress(index, enrichedInput)
  if (addressMatch) return addressMatch

  return {
    lootauraVisible: false,
    matchMethod: null,
    matchedIngestedSaleId: null,
    matchedSaleId: null,
    sourceListingId,
    saleInstanceKey,
  }
}
