import type { ExternalPageSourceListing } from '@/lib/ingestion/adapters/externalPageSource'
import {
  classifyYstmListMetadataAsValidActive,
  deriveYstmListMetadataTitle,
} from '@/lib/ingestion/ystmCoverage/classifyYstmListMetadataAsValidActive'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import { findPublishedIngestedSaleIdForDetailFirst } from '@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst'
import { coerceIngestedDateToYyyyMmDd } from '@/lib/ingestion/saleWindowDates'
import { detailFirstIngestLifecycleDbFields, resolveDetailFirstIngestLifecycle } from '@/lib/ingestion/detailFirstIngestLifecycle'
import { computeYstmSaleInstanceIdentity, saleInstanceIdentityDbColumns } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { resolveIngestAddressLifecycle } from '@/lib/ingestion/address/resolveIngestAddressLifecycle'
import { recordIngestedSaleSourceUrl } from '@/lib/ingestion/identity/recordIngestedSaleSourceUrl'
import { resolveIngestedSaleInsertCollision } from '@/lib/ingestion/identity/resolveIngestedSaleInsertCollision'
import { extractYstmSourceListingId } from '@/lib/ingestion/identity/ystmSourceListingId'
import { publishReadyIngestedSaleById } from '@/lib/ingestion/publishWorker'
import { lookupSpatialCoordinates, type SpatialCoordinateResolution } from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { ingestedSaleTimeSourceForDb } from '@/lib/ingestion/ingestedSaleDbConstraints'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

const PARSER_VERSION_ROW = 'external_page_source_mvp_v3'

export type YstmListFastPublishResult =
  | { outcome: 'published'; ingestedSaleId: string }
  | { outcome: 'ingested'; ingestedSaleId: string }
  | { outcome: 'skipped_duplicate' }
  | { outcome: 'skipped_invalid'; reason: string }
  | { outcome: 'failed'; reason: string }

function detailScheduleFieldsForMetadata(sale: YstmListMetadataSale) {
  return {
    time_start: null as string | null,
    time_end: null as string | null,
    date_source: 'list_metadata' as const,
    time_source: 'unknown' as const,
  }
}

function metadataToListing(
  sale: YstmListMetadataSale,
  city: string,
  state: string
): ExternalPageSourceListing {
  const externalId = extractYstmSourceListingId(sale.sourceUrl)
  return {
    title: deriveYstmListMetadataTitle(sale) ?? 'External listing yard sale',
    description: sale.description,
    addressRaw: sale.address,
    city,
    state,
    sourceUrl: sale.sourceUrl,
    imageSourceUrl: sale.imageUrls[0] ?? null,
    startDate: sale.startDate ?? undefined,
    endDate: sale.endDate ?? undefined,
    rawPayload: {
      adapter: 'external_page_source',
      externalId,
      listFastPublish: true,
      listMetadataSnapshot: true,
      ystmNativeLat: sale.lat,
      ystmNativeLng: sale.lng,
    },
  }
}

function spatialFromMetadata(sale: YstmListMetadataSale): SpatialCoordinateResolution | null {
  if (sale.lat == null || sale.lng == null) return null
  if (!Number.isFinite(sale.lat) || !Number.isFinite(sale.lng)) return null
  return {
    lat: sale.lat,
    lng: sale.lng,
    geocode_confidence: 'medium',
    coordinate_precision: 'approximate',
    geocode_method: 'ystm_provider_native',
    resolutionSource: 'ystm_provider_native',
  }
}

function buildListFastIngestRow(input: {
  platform: string
  listing: ExternalPageSourceListing
  city: string
  state: string
  normalizedLine: string | null
  nativeFirst: boolean
  spatial: SpatialCoordinateResolution
  scheduleFields: ReturnType<typeof detailScheduleFieldsForMetadata>
  addressLifecycle: ReturnType<typeof resolveIngestAddressLifecycle>
  rowPayload: Record<string, unknown>
}): Record<string, unknown> {
  const dateStart = coerceIngestedDateToYyyyMmDd(input.listing.startDate)
  const dateEnd = coerceIngestedDateToYyyyMmDd(input.listing.endDate)

  const saleInstanceIdentity = computeYstmSaleInstanceIdentity({
    sourcePlatform: input.platform,
    sourceUrl: input.listing.sourceUrl,
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedLine,
    dateStart,
    dateEnd,
    timeStart: input.scheduleFields.time_start,
    timeEnd: input.scheduleFields.time_end,
    title: input.listing.title,
    description: input.listing.description,
    imageSourceUrl: input.listing.imageSourceUrl,
    lat: input.spatial.lat,
    lng: input.spatial.lng,
    rawPayload: input.rowPayload,
  })

  const ingestLifecycle = resolveDetailFirstIngestLifecycle({
    addressLifecycle: input.addressLifecycle,
    normalizedLine: input.normalizedLine,
    city: input.city,
    state: input.state,
    nativeFirst: input.nativeFirst,
  })

  return {
    source_platform: input.platform,
    source_url: input.listing.sourceUrl,
    external_id: (input.listing.rawPayload.externalId as string | null) ?? null,
    title: input.listing.title,
    description: input.listing.description,
    address_raw: input.listing.addressRaw,
    normalized_address: input.normalizedLine,
    city: input.city,
    state: input.state,
    zip_code: null,
    lat: input.spatial.lat,
    lng: input.spatial.lng,
    date_start: dateStart,
    date_end: dateEnd,
    time_start: input.scheduleFields.time_start,
    time_end: input.scheduleFields.time_end,
    date_source: input.scheduleFields.date_source,
    time_source: ingestedSaleTimeSourceForDb(input.scheduleFields.time_source),
    image_source_url: input.listing.imageSourceUrl,
    raw_text: null,
    raw_payload: input.rowPayload,
    failure_reasons: [],
    parser_version: PARSER_VERSION_ROW,
    parse_confidence: 'high',
    is_duplicate: false,
    duplicate_of: null,
    geocode_confidence: input.spatial.geocode_confidence,
    coordinate_precision: input.spatial.coordinate_precision,
    geocode_method: input.spatial.geocode_method,
    ...detailFirstIngestLifecycleDbFields(ingestLifecycle),
    ...saleInstanceIdentityDbColumns(saleInstanceIdentity),
  }
}

/**
 * Publish a YSTM sale from list metadata without detail page fetch (2h SLA path).
 */
export async function attemptYstmListFastPublish(input: {
  sale: YstmListMetadataSale
  city: string
  state: string
  configKey?: string | null
  telemetryContext?: Record<string, unknown>
}): Promise<YstmListFastPublishResult> {
  const validity = classifyYstmListMetadataAsValidActive(input.sale)
  if (!validity.valid) {
    return { outcome: 'skipped_invalid', reason: validity.reason }
  }

  const admin = getAdminDb()
  const existingPublishedId = await findPublishedIngestedSaleIdForDetailFirst(admin, input.sale.canonicalUrl)
  if (existingPublishedId) {
    return { outcome: 'skipped_duplicate' }
  }

  const listing = metadataToListing(input.sale, input.city, input.state)
  const scheduleFields = detailScheduleFieldsForMetadata(input.sale)
  const nativeSpatial = spatialFromMetadata(input.sale)
  const nativeFirst = nativeSpatial != null

  let normalizedLine: string | null = null
  if (!nativeFirst && input.sale.address?.trim()) {
    normalizedLine = normalizeAddressForPublish(input.sale.address, input.city, input.state)
  }

  const addressLifecycle = resolveIngestAddressLifecycle({
    sourceUrl: input.sale.sourceUrl,
    addressRaw: listing.addressRaw,
    wouldBeNeedsGeocode: !nativeFirst,
    diagnostics: { slugWasPlaceholder: false },
  })

  let spatial = nativeSpatial
  if (!spatial) {
    spatial = await lookupSpatialCoordinates({
      addressRaw: listing.addressRaw,
      normalizedAddress: normalizedLine,
      city: input.city,
      state: input.state,
      sourceUrl: input.sale.sourceUrl,
      telemetryContext: input.telemetryContext,
    })
  }

  if (!spatial) {
    return { outcome: 'failed', reason: 'geocode_unavailable' }
  }

  const rowPayload: Record<string, unknown> = {
    adapter: 'external_page_source',
    parser_version: PARSER_VERSION_ROW,
    list_fast_publish: true,
    coverage_missing_ingest: true,
    extractedFields: {
      externalId: extractYstmSourceListingId(input.sale.sourceUrl),
    },
    listMetadataSnapshot: input.sale,
    configKey: input.configKey ?? null,
  }

  const ingestRow = buildListFastIngestRow({
    platform: 'external_page_source',
    listing,
    city: input.city,
    state: input.state,
    normalizedLine,
    nativeFirst,
    spatial,
    scheduleFields,
    addressLifecycle,
    rowPayload,
  })

  const { data: insertedRow, error: insErr } = await fromBase(admin, 'ingested_sales')
    .insert(ingestRow)
    .select('id, status')
    .maybeSingle()

  let ingestedSaleId = insertedRow?.id ? String(insertedRow.id) : null
  if (!ingestedSaleId) {
    const resolved = await resolveIngestedSaleInsertCollision(admin, {
      sourceUrl: listing.sourceUrl,
      row: ingestRow,
    })
    if (resolved?.publishedMatch) {
      return { outcome: 'skipped_duplicate' }
    }
    if (resolved?.id) {
      ingestedSaleId = resolved.id
    }
  }

  if (!ingestedSaleId) {
    logger.warn('ystm list-fast publish insert failed', {
      component: 'ingestion/acquisition/ystmListFastPublish',
      message: insErr?.message ?? 'insert_failed',
    })
    return { outcome: 'failed', reason: 'insert_failed' }
  }

  await recordIngestedSaleSourceUrl(admin, {
    ingestedSaleId,
    sourcePlatform: 'external_page_source',
    sourceUrl: listing.sourceUrl,
    sourceListingId: (ingestRow.source_listing_id as string | null) ?? null,
    payloadHash: (ingestRow.source_payload_hash as string | null) ?? null,
  })

  if ((insertedRow?.status as string | undefined) !== 'ready' && ingestRow.status !== 'ready') {
    return { outcome: 'ingested', ingestedSaleId }
  }

  const publishResult = await publishReadyIngestedSaleById(ingestedSaleId)
  if (publishResult.ok && 'publishedSaleId' in publishResult) {
    return { outcome: 'published', ingestedSaleId }
  }

  return { outcome: 'ingested', ingestedSaleId }
}
