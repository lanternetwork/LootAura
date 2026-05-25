import type {
  ExternalPageSourceListing,
  ParseExternalPageSourceResult,
} from '@/lib/ingestion/adapters/externalPageSource'

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function sortStrings(xs: string[]): string[] {
  return [...xs].sort((a, b) => a.localeCompare(b))
}

function sortKeyDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortKeyDeep)
  const o = value as Record<string, unknown>
  const keys = Object.keys(o).sort((a, b) => a.localeCompare(b))
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    out[k] = sortKeyDeep(o[k])
  }
  return out
}

function normalizeRejectedCandidates(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  const copy = value.map((v) => sortKeyDeep(v))
  return copy.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function shrinkIngestionDiagnostics(diag: unknown): unknown {
  if (!diag || typeof diag !== 'object') return diag
  const d = diag as Record<string, unknown>
  const authority = d.authority
  return sortKeyDeep({
    addressSource: d.addressSource,
    addressSources: Array.isArray(d.addressSources) ? [...(d.addressSources as string[])] : d.addressSources,
    chosenAddressSource: d.chosenAddressSource,
    slugWasPlaceholder: d.slugWasPlaceholder,
    metadataAddressSkippedAsUntrusted: d.metadataAddressSkippedAsUntrusted,
    nearbyCandidateCount: d.nearbyCandidateCount,
    rejectedAddressCandidates: normalizeRejectedCandidates(d.rejectedAddressCandidates),
    authority: authority && typeof authority === 'object' ? sortKeyDeep(authority) : authority,
  })
}

function shrinkRawPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const imageUrls = raw.imageUrls
  const sortedImages =
    Array.isArray(imageUrls) && imageUrls.every((u) => typeof u === 'string')
      ? sortStrings(imageUrls as string[])
      : imageUrls

  const esnet =
    raw.sourcePlatform === 'estatesales_net'
      ? {
          schemaVersion: raw.schemaVersion ?? null,
          sourcePlatform: raw.sourcePlatform,
          esnetSaleId: raw.esnetSaleId ?? null,
          orgName: raw.orgName ?? null,
          saleTypeName: raw.saleTypeName ?? null,
          postalCode: raw.postalCode ?? null,
          utcShowAddressAfter: raw.utcShowAddressAfter ?? null,
          pictureCount: raw.pictureCount ?? null,
          listPageUrl: raw.listPageUrl ?? null,
        }
      : {}

  return sortKeyDeep({
    adapter: raw.adapter,
    externalId: raw.externalId ?? null,
    ...esnet,
    pathCitySlug: raw.pathCitySlug ?? null,
    hubSegment: raw.hubSegment ?? null,
    addressSlug: raw.addressSlug ?? null,
    addressTailCity: raw.addressTailCity ?? null,
    cityConflict: raw.cityConflict ?? null,
    citySource: raw.citySource ?? null,
    stateSource: raw.stateSource ?? null,
    resolvedCity: raw.resolvedCity ?? null,
    resolvedState: raw.resolvedState ?? null,
    urlMunicipalityNormalized: raw.urlMunicipalityNormalized ?? null,
    imageUrls: sortedImages,
    ingestionDiagnostics: shrinkIngestionDiagnostics(raw.ingestionDiagnostics),
  }) as Record<string, unknown>
}

function listingToSnapshot(l: ExternalPageSourceListing): Record<string, unknown> {
  const imageUrlsRaw = l.rawPayload.imageUrls
  const imageUrls =
    Array.isArray(imageUrlsRaw) && imageUrlsRaw.every((u) => typeof u === 'string')
      ? sortStrings(imageUrlsRaw as string[])
      : null

  return sortKeyDeep({
    title: collapseWs(l.title),
    description: l.description == null ? null : collapseWs(l.description),
    addressRaw: l.addressRaw == null ? null : collapseWs(l.addressRaw),
    city: l.city,
    state: l.state,
    startDate: l.startDate ?? null,
    endDate: l.endDate ?? null,
    sourceUrl: l.sourceUrl,
    imageSourceUrl: l.imageSourceUrl,
    imageUrls,
    dedupeIdentifiers: sortKeyDeep({
      externalId: typeof l.rawPayload.externalId === 'string' ? l.rawPayload.externalId : null,
      sourceUrl: l.sourceUrl,
    }),
    extractionConfidence:
      typeof l.rawPayload.extractionConfidence === 'number' ? l.rawPayload.extractionConfidence : null,
    rawPayload: shrinkRawPayload(l.rawPayload),
  }) as Record<string, unknown>
}

export type ExternalPageParserStatus = 'ok' | 'partial' | 'error'

export function externalPageParserStatus(result: ParseExternalPageSourceResult): ExternalPageParserStatus {
  if (result.listings.length > 0) return 'ok'
  if (result.invalid > 0) return 'error'
  return 'partial'
}

/**
 * Deterministic snapshot for fixture comparison: stable listing order, sorted images,
 * sorted object keys, collapsed whitespace on free text.
 */
export function normalizeExternalPageParseResult(result: ParseExternalPageSourceResult): Record<string, unknown> {
  const listings = [...result.listings]
    .sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl))
    .map(listingToSnapshot)

  return sortKeyDeep({
    parserAdapter: 'external_page_source',
    parserStatus: externalPageParserStatus(result),
    invalid: result.invalid,
    listings,
  }) as Record<string, unknown>
}
