import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  fetchExternalPageSource,
  type ExternalPageSourceIngestionConfig,
  type ExternalPageSourceListing,
} from '@/lib/ingestion/adapters/externalPageSource'
import {
  buildDetailFirstFieldProvenance,
  detailScheduleFieldsForListing,
  mergeIngestionDiagnosticsForDetailFirst,
  readDetailFirstFieldProvenance,
} from '@/lib/ingestion/acquisition/detailFirstFieldProvenance'
import {
  classifyDetailFirstInsertFailure,
  insertFailureTelemetryFields,
} from '@/lib/ingestion/acquisition/classifyDetailFirstInsertFailure'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { resolveIngestedSaleInsertCollision } from '@/lib/ingestion/identity/resolveIngestedSaleInsertCollision'
import {
  markIngestedSaleExpiredFromYstmRefresh,
  updateExistingIngestedSaleForDetailFirst,
} from '@/lib/ingestion/acquisition/updateExistingIngestedSaleForDetailFirst'
import { resolveDetailFirstMergedAddressRaw } from '@/lib/ingestion/acquisition/ystmDetailPageAddressResolver'
import {
  detailFirstValidationTelemetry,
  validateDetailEnrichedListing,
} from '@/lib/ingestion/acquisition/validateDetailEnrichedListing'
import { detectGatedListing } from '@/lib/ingestion/address/addressGated'
import {
  addressLifecycleFieldsForDb,
  resolveIngestAddressLifecycle,
} from '@/lib/ingestion/address/resolveIngestAddressLifecycle'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { publishReadyIngestedSaleById } from '@/lib/ingestion/publishWorker'
import { classifyDetailFirstSpatialFailure } from '@/lib/ingestion/acquisition/classifyDetailFirstSpatialFailure'
import {
  reconcileDetailFirstFallbackReasonCounts,
  type YstmDetailFirstFallbackReason,
} from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'
import { upsertAddressGeocodeCache } from '@/lib/ingestion/spatial/addressGeocodeCache'
import {
  lookupSpatialCoordinates,
  type SpatialCoordinateResolution,
} from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { ingestedSaleTimeSourceForDb } from '@/lib/ingestion/ingestedSaleDbConstraints'
import {
  computeYstmSaleInstanceIdentity,
  saleInstanceIdentityDbColumns,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { recordIngestedSaleSourceUrl } from '@/lib/ingestion/identity/recordIngestedSaleSourceUrl'
import {
  classifySaleInstance,
  saleInstanceClassificationTelemetry,
  shouldReviveExpiredRowForSaleInstanceDecision,
} from '@/lib/ingestion/identity/classifySaleInstance'
import {
  planYstmUrlReuseSupersessionOnDetailRefresh,
  supersedePublishedSaleForUrlReuse,
} from '@/lib/ingestion/identity/ystmUrlReuseSupersession'
import { parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'
import { coerceIngestedDateToYyyyMmDd } from '@/lib/ingestion/saleWindowDates'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents, type ObservabilityEventName } from '@/lib/observability/events'
export { parseYstmDetailFirstConcurrencyFromEnv } from '@/lib/ingestion/acquisition/ystmDetailFirstReadyConfig'

const PARSER_VERSION_ROW = 'external_page_source_mvp_v3'

export type { YstmDetailFirstFallbackReason } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'
export type YstmDetailFirstRejectedReason = YstmDetailFirstFallbackReason

export type YstmDetailFirstRunMetrics = {
  attempted: number
  succeeded: number
  published: number
  fallback: number
  fetchFailed: number
  rejectedByReason: Partial<Record<YstmDetailFirstFallbackReason, number>>
  msToPublishedSamples: number[]
  /** Listings whose validated address came from detail DOM (Phase 4 observability). */
  addressValidatedFromDetailPage: number
  /** Listings whose validated address came from list seed after merge (Phase 4 observability). */
  addressValidatedFromListSeed: number
  /** Phase C: postgres / API codes for insert_failed attempts (e.g. 23505, 23514). */
  insertFailedByDbCode: Record<string, number>
}

export function emptyYstmDetailFirstRunMetrics(): YstmDetailFirstRunMetrics {
  return {
    attempted: 0,
    succeeded: 0,
    published: 0,
    fallback: 0,
    fetchFailed: 0,
    rejectedByReason: {},
    msToPublishedSamples: [],
    addressValidatedFromDetailPage: 0,
    addressValidatedFromListSeed: 0,
    insertFailedByDbCode: {},
  }
}

export function mergeDetailFirstInsertFailedByDbCode(
  target: Record<string, number>,
  delta: Record<string, number> | undefined
): void {
  if (!delta) return
  for (const [code, count] of Object.entries(delta)) {
    if (!count || count <= 0) continue
    target[code] = (target[code] ?? 0) + count
  }
}

export function mergeYstmDetailFirstMetrics(
  target: YstmDetailFirstRunMetrics,
  delta: YstmDetailFirstRunMetrics
): void {
  target.attempted += delta.attempted
  target.succeeded += delta.succeeded
  target.published += delta.published
  target.fallback += delta.fallback
  target.fetchFailed += delta.fetchFailed
  target.addressValidatedFromDetailPage += delta.addressValidatedFromDetailPage
  target.addressValidatedFromListSeed += delta.addressValidatedFromListSeed
  target.msToPublishedSamples.push(...delta.msToPublishedSamples)
  for (const [reason, count] of Object.entries(delta.rejectedByReason)) {
    const key = reason as YstmDetailFirstFallbackReason
    target.rejectedByReason[key] = (target.rejectedByReason[key] ?? 0) + (count ?? 0)
  }
  mergeDetailFirstInsertFailedByDbCode(target.insertFailedByDbCode, delta.insertFailedByDbCode)
  reconcileDetailFirstFallbackReasonCounts(target.rejectedByReason, target.fallback)
}

function recordDetailFirstFallback(
  metrics: YstmDetailFirstRunMetrics,
  reason: YstmDetailFirstFallbackReason
): void {
  metrics.fallback = 1
  metrics.rejectedByReason[reason] = (metrics.rejectedByReason[reason] ?? 0) + 1
}

function finalizeDetailFirstAttemptMetrics(metrics: YstmDetailFirstRunMetrics): void {
  reconcileDetailFirstFallbackReasonCounts(metrics.rejectedByReason, metrics.fallback)
}

function recordDetailFirstInsertFailure(
  metrics: YstmDetailFirstRunMetrics,
  classification: ReturnType<typeof classifyDetailFirstInsertFailure>
): void {
  if (classification.reason === 'insert_failed') {
    const code = classification.dbCode?.trim() || 'unknown'
    metrics.insertFailedByDbCode[code] = (metrics.insertFailedByDbCode[code] ?? 0) + 1
  }
  recordDetailFirstFallback(metrics, classification.reason)
}

function buildDetailFirstIngestedSaleInsertRow(input: {
  platform: string
  listing: ExternalPageSourceListing
  city: string
  state: string
  normalizedLine: string | null
  nativeFirst: boolean
  spatial: SpatialCoordinateResolution
  scheduleFields: ReturnType<typeof detailScheduleFieldsForListing>
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
    status: 'ready',
    failure_reasons: [],
    parser_version: PARSER_VERSION_ROW,
    parse_confidence: 'high',
    is_duplicate: false,
    duplicate_of: null,
    geocode_confidence: input.spatial.geocode_confidence,
    coordinate_precision: input.spatial.coordinate_precision,
    geocode_method: input.spatial.geocode_method,
    ...addressLifecycleFieldsForDb(
      input.nativeFirst
        ? {
            addressStatus: 'address_enrichment_pending',
            canonicalSourceUrl: input.addressLifecycle.canonicalSourceUrl,
            addressUnlockAt: null,
            nextEnrichmentAttemptAt: null,
            ingestStatus: 'ready',
          }
        : {
            addressStatus: 'address_available',
            canonicalSourceUrl: input.addressLifecycle.canonicalSourceUrl,
            addressUnlockAt: input.addressLifecycle.addressUnlockAt,
            nextEnrichmentAttemptAt: null,
            ingestStatus: 'ready',
          }
    ),
    ...saleInstanceIdentityDbColumns(saleInstanceIdentity),
  }
}

function mergeListingFields(
  listSeed: ExternalPageSourceListing,
  detail: ExternalPageSourceListing
): ExternalPageSourceListing {
  const detailPayload =
    typeof detail.rawPayload === 'object' && detail.rawPayload ? detail.rawPayload : {}
  const detailParsed = Boolean(
    (detailPayload as { detailPageParsed?: boolean }).detailPageParsed
  )
  const rawPayload = {
    ...(typeof listSeed.rawPayload === 'object' && listSeed.rawPayload ? listSeed.rawPayload : {}),
    ...detailPayload,
    detailFirstReady: true,
  }
  return {
    title: detail.title?.trim() ? detail.title : listSeed.title,
    description: detail.description?.trim() ? detail.description : listSeed.description,
    addressRaw: detailParsed
      ? detail.addressRaw ?? null
      : detail.addressRaw?.trim()
        ? detail.addressRaw
        : listSeed.addressRaw,
    city: detail.city?.trim() ? detail.city : listSeed.city,
    state: detail.state?.trim() ? detail.state : listSeed.state,
    startDate: detail.startDate ?? listSeed.startDate,
    endDate: detail.endDate ?? listSeed.endDate,
    sourceUrl: listSeed.sourceUrl,
    imageSourceUrl: detail.imageSourceUrl ?? listSeed.imageSourceUrl,
    rawPayload,
  }
}

/**
 * Parse a YSTM detail page into a listing row (detail DOM is authoritative; list seed fills gaps).
 */
export function parseYstmDetailListingFromHtml(input: {
  html: string
  sourceUrl: string
  config: ExternalPageSourceIngestionConfig
  listSeed: ExternalPageSourceListing
}): ExternalPageSourceListing | null {
  if (!parseYstmListingPathParts(input.sourceUrl)) {
    return null
  }

  const detailPage = parseYstmDetailPageFromHtml({
    html: input.html,
    sourceUrl: input.sourceUrl,
    configCity: input.config.city,
    configState: input.config.state,
  })
  if (!detailPage) {
    return null
  }

  const mergedAddressRaw = resolveDetailFirstMergedAddressRaw(detailPage, input.listSeed)

  const detailListing: ExternalPageSourceListing = {
    title: detailPage.title ?? input.listSeed.title,
    description: detailPage.description ?? input.listSeed.description,
    addressRaw: mergedAddressRaw,
    city: detailPage.city ?? input.listSeed.city,
    state: detailPage.state ?? input.listSeed.state,
    startDate: detailPage.startDate ?? input.listSeed.startDate,
    endDate: detailPage.endDate ?? input.listSeed.endDate,
    sourceUrl: input.listSeed.sourceUrl,
    imageSourceUrl: detailPage.imageUrls[0] ?? input.listSeed.imageSourceUrl,
    rawPayload: {
      ...(typeof input.listSeed.rawPayload === 'object' && input.listSeed.rawPayload
        ? input.listSeed.rawPayload
        : {}),
      detailPageParsed: true,
      cityConflict: detailPage.cityConflict,
      ...(detailPage.nativeCoords
        ? {
            ystmNativeLat: detailPage.nativeCoords.lat,
            ystmNativeLng: detailPage.nativeCoords.lng,
            ystmNativeCoordSource: detailPage.nativeCoords.source,
          }
        : {}),
      ...(detailPage.imageUrls.length > 0 ? { imageUrls: detailPage.imageUrls } : {}),
      ...(detailPage.detailTimeStart
        ? { detailTimeStart: detailPage.detailTimeStart, detailTimeEnd: detailPage.detailTimeEnd }
        : {}),
      ...(detailPage.addressSource ? { detailFirstAddressSource: detailPage.addressSource } : {}),
    },
  }

  const merged = mergeListingFields(input.listSeed, detailListing)
  const provenance = buildDetailFirstFieldProvenance(detailPage, input.listSeed)
  const ingestionDiagnostics = mergeIngestionDiagnosticsForDetailFirst(
    input.listSeed,
    provenance,
    merged,
    detailPage
  )

  return {
    ...merged,
    rawPayload: {
      ...(typeof merged.rawPayload === 'object' && merged.rawPayload ? merged.rawPayload : {}),
      detailFirstFieldProvenance: provenance,
      ingestionDiagnostics,
    },
  }
}

export type YstmDetailFirstAttemptParams = {
  config: ExternalPageSourceIngestionConfig
  listSeed: ExternalPageSourceListing
  platform: string
  rowPayload: Record<string, unknown>
  pageIndex: number
  /** Phase 4: refresh an existing ingested_sales row instead of insert. */
  existingIngestedSaleId?: string
  telemetryContext?: Record<string, unknown>
  beforeDetailFetch?: (params: {
    detailUrl: string
    pageIndex: number
    city: string
    state: string
  }) => Promise<void> | void
}

export type YstmDetailFirstAttemptResult =
  | { outcome: 'ready'; ingestedSaleId: string; published: boolean; markedExpired?: boolean }
  | {
      outcome: 'fallback'
      reason: YstmDetailFirstFallbackReason
      /** Parsed detail+seed merge for legacy insert when detail-first validation fails. */
      detailEnrichedListing?: ExternalPageSourceListing
      /** Fetched detail HTML for native coord lookup on legacy fallback. */
      detailPageHtml?: string
    }

function buildDetailFirstFallbackResult(
  reason: YstmDetailFirstFallbackReason,
  legacyContext?: {
    detailEnrichedListing?: ExternalPageSourceListing
    detailPageHtml?: string
  }
): YstmDetailFirstAttemptResult {
  if (!legacyContext?.detailEnrichedListing && !legacyContext?.detailPageHtml) {
    return { outcome: 'fallback', reason }
  }
  return {
    outcome: 'fallback',
    reason,
    ...(legacyContext.detailEnrichedListing
      ? { detailEnrichedListing: legacyContext.detailEnrichedListing }
      : {}),
    ...(legacyContext.detailPageHtml ? { detailPageHtml: legacyContext.detailPageHtml } : {}),
  }
}

export async function attemptYstmDetailFirstReady(
  params: YstmDetailFirstAttemptParams
): Promise<{ result: YstmDetailFirstAttemptResult; metrics: YstmDetailFirstRunMetrics }> {
  const metrics = emptyYstmDetailFirstRunMetrics()
  metrics.attempted = 1

  const telem = params.telemetryContext ?? {}
  const sourceUrl = params.listSeed.sourceUrl

  if (!isYstmDetailListingUrl(sourceUrl)) {
    recordDetailFirstFallback(metrics, 'parse_no_listing')
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: 'parse_no_listing',
    })
    return { result: { outcome: 'fallback', reason: 'parse_no_listing' }, metrics }
  }

  emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstAttempted, telem, {
    pageIndex: params.pageIndex,
  })

  if (params.beforeDetailFetch) {
    try {
      await params.beforeDetailFetch({
        detailUrl: sourceUrl,
        pageIndex: params.pageIndex,
        city: params.config.city,
        state: params.config.state,
      })
    } catch {
      // Pacing hook failures must not block ingestion.
    }
  }

  const startedMs = Date.now()
  let html: string
  try {
    html = await fetchExternalPageSource(params.config, sourceUrl, params.pageIndex)
  } catch (err) {
    metrics.fetchFailed = 1
    recordDetailFirstFallback(metrics, 'fetch_failed')
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFetchFailed, telem, {
      pageIndex: params.pageIndex,
    })
    logger.warn('YSTM detail-first: detail fetch failed', {
      component: 'ingestion/acquisition/ystmDetailFirstReady',
      operation: 'detail_fetch',
      city: params.config.city,
      state: params.config.state,
      message: err instanceof Error ? err.message : String(err),
    })
    return { result: { outcome: 'fallback', reason: 'fetch_failed' }, metrics }
  }

  const listing = parseYstmDetailListingFromHtml({
    html,
    sourceUrl,
    config: params.config,
    listSeed: params.listSeed,
  })
  if (!listing) {
    recordDetailFirstFallback(metrics, 'parse_no_listing')
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: 'parse_no_listing',
    })
    return {
      result: buildDetailFirstFallbackResult('parse_no_listing', { detailPageHtml: html }),
      metrics,
    }
  }

  const provenance = readDetailFirstFieldProvenance(listing)
  if (!provenance) {
    recordDetailFirstFallback(metrics, 'parse_no_listing')
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: 'parse_no_listing',
    })
    return {
      result: buildDetailFirstFallbackResult('parse_no_listing', {
        detailEnrichedListing: listing,
        detailPageHtml: html,
      }),
      metrics,
    }
  }

  const validationTelemetry = detailFirstValidationTelemetry(params.listSeed, listing, provenance)
  if (provenance.addressRaw === 'detail_page') {
    metrics.addressValidatedFromDetailPage = 1
  } else if (provenance.addressRaw === 'list_seed') {
    metrics.addressValidatedFromListSeed = 1
  }

  const validation = validateDetailEnrichedListing(listing, provenance)
  if (!validation.ok) {
    if (
      params.existingIngestedSaleId &&
      validation.reason === 'expired_after_detail'
    ) {
      const admin = getAdminDb()
      const marked = await markIngestedSaleExpiredFromYstmRefresh(
        admin,
        params.existingIngestedSaleId
      )
      if (marked) {
        metrics.succeeded = 1
        finalizeDetailFirstAttemptMetrics(metrics)
        emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstSucceeded, telem, {
          refreshMarkedExpired: true,
        })
        return {
          result: {
            outcome: 'ready',
            ingestedSaleId: params.existingIngestedSaleId,
            published: false,
            markedExpired: true,
          },
          metrics,
        }
      }
    }
    recordDetailFirstFallback(metrics, validation.reason)
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: validation.reason,
      ...validationTelemetry,
    })
    return {
      result: buildDetailFirstFallbackResult(validation.reason, {
        detailEnrichedListing: listing,
        detailPageHtml: html,
      }),
      metrics,
    }
  }

  const nativeFirst = validation.mode === 'native'
  const { city, state } = validation
  const normalizedLine = validation.mode === 'address' ? validation.normalizedLine : null

  const ingestDiag = (listing.rawPayload.ingestionDiagnostics ?? {}) as Record<string, unknown>
  const addressLifecycle = resolveIngestAddressLifecycle({
    sourceUrl,
    addressRaw: listing.addressRaw,
    wouldBeNeedsGeocode: !nativeFirst,
    diagnostics: {
      slugWasPlaceholder: Boolean(ingestDiag.slugWasPlaceholder),
      chosenAddressSource:
        typeof ingestDiag.chosenAddressSource === 'string' ? ingestDiag.chosenAddressSource : undefined,
    },
  })

  const gated = detectGatedListing({ sourceUrl, addressRaw: listing.addressRaw })
  if (!nativeFirst && gated.gated && addressLifecycle.addressStatus === 'address_gated') {
    recordDetailFirstFallback(metrics, 'gated_address')
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'gated_address',
      ...validationTelemetry,
    })
    return {
      result: buildDetailFirstFallbackResult('gated_address', {
        detailEnrichedListing: listing,
        detailPageHtml: html,
      }),
      metrics,
    }
  }

  const spatial = await lookupSpatialCoordinates({
    addressRaw: listing.addressRaw,
    normalizedAddress: normalizedLine,
    city,
    state,
    sourceUrl,
    pageHtml: html,
    telemetryContext: telem,
  })

  if (!spatial) {
    const spatialReason = await classifyDetailFirstSpatialFailure({
      addressRaw: listing.addressRaw,
      normalizedAddress: normalizedLine,
      city,
      state,
      sourceUrl,
      pageHtml: html,
    })
    recordDetailFirstFallback(metrics, spatialReason)
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: spatialReason,
      ...validationTelemetry,
    })
    return {
      result: buildDetailFirstFallbackResult(spatialReason, {
        detailEnrichedListing: listing,
        detailPageHtml: html,
      }),
      metrics,
    }
  }

  if (!nativeFirst && listing.addressRaw?.trim() && normalizedLine) {
    await upsertAddressGeocodeCache({
      addressRaw: listing.addressRaw,
      normalizedAddress: normalizedLine,
      city,
      state,
      lat: spatial.lat,
      lng: spatial.lng,
      coordinate_precision: spatial.coordinate_precision,
      geocode_method: spatial.geocode_method,
    })
  }

  const admin = getAdminDb()
  const scheduleFields = detailScheduleFieldsForListing(listing)
  const rowPayload = {
    ...params.rowPayload,
    detailFirstReady: true,
    detailFirstResolution: spatial.resolutionSource,
    ...(nativeFirst ? { detailFirstNativeCoordsOnly: true } : {}),
  }
  const ingestRow = buildDetailFirstIngestedSaleInsertRow({
    platform: params.platform,
    listing,
    city,
    state,
    normalizedLine,
    nativeFirst,
    spatial,
    scheduleFields,
    addressLifecycle,
    rowPayload,
  })

  let ingestedSaleId: string | null = null

  if (params.existingIngestedSaleId) {
    const { data: priorRow } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, sale_instance_key, published_sale_id, date_start, date_end, status, failure_reasons, normalized_address'
      )
      .eq('id', params.existingIngestedSaleId)
      .maybeSingle()

    const priorCandidate = priorRow?.id
      ? {
          id: String(priorRow.id),
          sale_instance_key: (priorRow as { sale_instance_key?: string | null }).sale_instance_key ?? null,
          published_sale_id:
            (priorRow as { published_sale_id?: string | null }).published_sale_id ?? null,
          date_start: (priorRow as { date_start?: string | null }).date_start ?? null,
          date_end: (priorRow as { date_end?: string | null }).date_end ?? null,
          status: String((priorRow as { status?: string }).status ?? ''),
          failure_reasons: (priorRow as { failure_reasons?: unknown }).failure_reasons,
          normalized_address:
            (priorRow as { normalized_address?: string | null }).normalized_address ?? null,
        }
      : null

    const saleInstanceClassification = priorCandidate
      ? classifySaleInstance({
          sourcePlatform: params.platform,
          sourceUrl: listing.sourceUrl,
          state,
          city,
          normalizedAddress: normalizedLine,
          dateStart: listing.startDate ?? null,
          dateEnd: listing.endDate ?? null,
          timeStart: scheduleFields.time_start,
          timeEnd: scheduleFields.time_end,
          title: listing.title,
          description: listing.description,
          imageSourceUrl: listing.imageSourceUrl,
          lat: spatial.lat,
          lng: spatial.lng,
          rawPayload: rowPayload,
          existingRowsBySourceUrl: [
            {
              id: priorCandidate.id,
              sale_instance_key: priorCandidate.sale_instance_key,
              source_content_hash:
                (priorRow as { source_content_hash?: string | null }).source_content_hash ?? null,
              date_start: priorCandidate.date_start,
              date_end: priorCandidate.date_end,
              normalized_address: priorCandidate.normalized_address,
              status: priorCandidate.status,
              failure_reasons: priorCandidate.failure_reasons,
            },
          ],
          existingRowsBySaleInstanceKey: priorCandidate.sale_instance_key
            ? [
                {
                  id: priorCandidate.id,
                  sale_instance_key: priorCandidate.sale_instance_key,
                  date_start: priorCandidate.date_start,
                  date_end: priorCandidate.date_end,
                  normalized_address: priorCandidate.normalized_address,
                  status: priorCandidate.status,
                  failure_reasons: priorCandidate.failure_reasons,
                },
              ]
            : [],
          existingRowsByAddressDate: [],
        })
      : null

    if (saleInstanceClassification) {
      emitDetailFirstEvent(ObservabilityEvents.ingestion.saleInstanceClassified, telem, {
        ...saleInstanceClassificationTelemetry(saleInstanceClassification),
        existingIngestedSaleId: params.existingIngestedSaleId,
      })
    }

    const supersessionPatch = priorCandidate
      ? planYstmUrlReuseSupersessionOnDetailRefresh({
          prior: priorCandidate,
          sourcePlatform: params.platform,
          sourceUrl: listing.sourceUrl,
          state,
          city,
          nextSaleInstanceKey: (ingestRow.sale_instance_key as string | null) ?? null,
          nextSourceContentHash: (ingestRow.source_content_hash as string | null) ?? null,
          listingStartDate: listing.startDate ?? null,
          listingEndDate: listing.endDate ?? null,
          listingAddressRaw: listing.addressRaw,
        })
      : null

    if (supersessionPatch) {
      Object.assign(ingestRow, supersessionPatch)
      await supersedePublishedSaleForUrlReuse(admin, supersessionPatch.superseded_sale_id)
    }

    const reviveExpiredUrlReuse =
      saleInstanceClassification != null &&
      shouldReviveExpiredRowForSaleInstanceDecision(saleInstanceClassification.decision)

    const updated = await updateExistingIngestedSaleForDetailFirst(admin, {
      ingestedSaleId: params.existingIngestedSaleId,
      row: ingestRow,
      reviveExpiredUrlReuse,
    })
    ingestedSaleId = updated?.id ?? null
    if (!ingestedSaleId) {
      recordDetailFirstFallback(metrics, 'insert_failed')
      finalizeDetailFirstAttemptMetrics(metrics)
      emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
        rejectedReason: 'insert_failed',
        ...validationTelemetry,
      })
      return {
        result: buildDetailFirstFallbackResult('insert_failed', {
          detailEnrichedListing: listing,
          detailPageHtml: html,
        }),
        metrics,
      }
    }
  } else {
    const { data: insertedRow, error: insErr } = await fromBase(admin, 'ingested_sales')
      .insert(ingestRow)
      .select('id')
      .maybeSingle()

    ingestedSaleId = insertedRow?.id ? String(insertedRow.id) : null

    if (!ingestedSaleId) {
      const insertFailure = classifyDetailFirstInsertFailure(insErr)

      if (insertFailure.reason === 'canonical_collision') {
        const resolved = await resolveIngestedSaleInsertCollision(admin, {
          sourceUrl: listing.sourceUrl,
          row: ingestRow,
        })
        if (resolved?.publishedMatch) {
          await recordIngestedSaleSourceUrl(admin, {
            ingestedSaleId: resolved.id,
            sourcePlatform: params.platform,
            sourceUrl: listing.sourceUrl,
            sourceListingId: (ingestRow.source_listing_id as string | null) ?? null,
            payloadHash: (ingestRow.source_payload_hash as string | null) ?? null,
          })
          metrics.succeeded = 1
          finalizeDetailFirstAttemptMetrics(metrics)
          return {
            result: { outcome: 'ready', ingestedSaleId: resolved.id, published: true },
            metrics,
          }
        }
        if (resolved?.id) {
          ingestedSaleId = resolved.id
        }
      }

      if (!ingestedSaleId) {
        recordDetailFirstInsertFailure(metrics, insertFailure)
        finalizeDetailFirstAttemptMetrics(metrics)
        emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
          rejectedReason: insertFailure.reason,
          ...insertFailureTelemetryFields(insertFailure),
          ...validationTelemetry,
        })
        return {
          result: buildDetailFirstFallbackResult(insertFailure.reason, {
            detailEnrichedListing: listing,
            detailPageHtml: html,
          }),
          metrics,
        }
      }
    }
  }

  metrics.succeeded = 1
  emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstSucceeded, telem, {
    resolutionSource: spatial.resolutionSource,
    ...validationTelemetry,
  })

  await recordIngestedSaleSourceUrl(admin, {
    ingestedSaleId,
    sourcePlatform: params.platform,
    sourceUrl: listing.sourceUrl,
    sourceListingId: (ingestRow.source_listing_id as string | null) ?? null,
    payloadHash: (ingestRow.source_payload_hash as string | null) ?? null,
  })

  const publishResult = await publishReadyIngestedSaleById(ingestedSaleId)
  const published = publishResult.ok === true && 'publishedSaleId' in publishResult
  if (published) {
    metrics.published = 1
    metrics.msToPublishedSamples.push(Date.now() - startedMs)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstPublished, telem, {
      resolutionSource: spatial.resolutionSource,
      msToPublished: Date.now() - startedMs,
    })
  } else {
    metrics.rejectedByReason.publish_failed = (metrics.rejectedByReason.publish_failed ?? 0) + 1
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'publish_failed',
    })
  }

  finalizeDetailFirstAttemptMetrics(metrics)
  return {
    result: { outcome: 'ready', ingestedSaleId, published },
    metrics,
  }
}

export async function mapWithBoundedConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let nextIndex = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      await fn(items[index]!, index)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
}

function emitDetailFirstEvent(
  event: ObservabilityEventName,
  telemetryContext: Record<string, unknown>,
  fields: Record<string, unknown>
): void {
  emitObservabilityRecord(
    buildTelemetryRecord(event, {
      ...telemetryContext,
      ...fields,
    })
  )
}
