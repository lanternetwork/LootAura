import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  fetchExternalPageSource,
  type ExternalPageSourceIngestionConfig,
  type ExternalPageSourceListing,
} from '@/lib/ingestion/adapters/externalPageSource'
import {
  buildDetailFirstFieldProvenance,
  dateSourceForDetailFirst,
  mergeIngestionDiagnosticsForDetailFirst,
  type DetailFirstFieldProvenance,
} from '@/lib/ingestion/acquisition/detailFirstFieldProvenance'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
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
import { lookupSpatialCoordinates } from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { parseYstmListingPathParts } from '@/lib/ingestion/ystmListingCityAuthority'
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
  target.msToPublishedSamples.push(...delta.msToPublishedSamples)
  for (const [reason, count] of Object.entries(delta.rejectedByReason)) {
    const key = reason as YstmDetailFirstFallbackReason
    target.rejectedByReason[key] = (target.rejectedByReason[key] ?? 0) + (count ?? 0)
  }
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

function mergeListingFields(
  listSeed: ExternalPageSourceListing,
  detail: ExternalPageSourceListing
): ExternalPageSourceListing {
  const rawPayload = {
    ...(typeof listSeed.rawPayload === 'object' && listSeed.rawPayload ? listSeed.rawPayload : {}),
    ...(typeof detail.rawPayload === 'object' && detail.rawPayload ? detail.rawPayload : {}),
    detailFirstReady: true,
  }
  return {
    title: detail.title?.trim() ? detail.title : listSeed.title,
    description: detail.description?.trim() ? detail.description : listSeed.description,
    addressRaw: detail.addressRaw?.trim() ? detail.addressRaw : listSeed.addressRaw,
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

  const detailListing: ExternalPageSourceListing = {
    title: detailPage.title ?? input.listSeed.title,
    description: detailPage.description ?? input.listSeed.description,
    addressRaw: detailPage.addressRaw ?? input.listSeed.addressRaw,
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
    },
  }

  const merged = mergeListingFields(input.listSeed, detailListing)
  const provenance = buildDetailFirstFieldProvenance(detailPage, input.listSeed)
  const ingestionDiagnostics = mergeIngestionDiagnosticsForDetailFirst(
    input.listSeed,
    provenance,
    merged
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

function readDetailFirstFieldProvenance(
  listing: ExternalPageSourceListing
): DetailFirstFieldProvenance | null {
  const raw = listing.rawPayload as { detailFirstFieldProvenance?: DetailFirstFieldProvenance }
  return raw.detailFirstFieldProvenance ?? null
}

export type YstmDetailFirstAttemptParams = {
  config: ExternalPageSourceIngestionConfig
  listSeed: ExternalPageSourceListing
  platform: string
  rowPayload: Record<string, unknown>
  pageIndex: number
  telemetryContext?: Record<string, unknown>
  beforeDetailFetch?: (params: {
    detailUrl: string
    pageIndex: number
    city: string
    state: string
  }) => Promise<void> | void
}

export type YstmDetailFirstAttemptResult =
  | { outcome: 'ready'; ingestedSaleId: string; published: boolean }
  | { outcome: 'fallback'; reason: YstmDetailFirstFallbackReason }

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
    return { result: { outcome: 'fallback', reason: 'parse_no_listing' }, metrics }
  }

  const provenance = readDetailFirstFieldProvenance(listing)
  if (!provenance) {
    recordDetailFirstFallback(metrics, 'parse_no_listing')
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: 'parse_no_listing',
    })
    return { result: { outcome: 'fallback', reason: 'parse_no_listing' }, metrics }
  }

  const validationTelemetry = detailFirstValidationTelemetry(params.listSeed, listing, provenance)
  const validation = validateDetailEnrichedListing(listing, provenance)
  if (!validation.ok) {
    recordDetailFirstFallback(metrics, validation.reason)
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: validation.reason,
      ...validationTelemetry,
    })
    return { result: { outcome: 'fallback', reason: validation.reason }, metrics }
  }

  const { city, state, normalizedLine } = validation

  const ingestDiag = (listing.rawPayload.ingestionDiagnostics ?? {}) as Record<string, unknown>
  const addressLifecycle = resolveIngestAddressLifecycle({
    sourceUrl,
    addressRaw: listing.addressRaw,
    wouldBeNeedsGeocode: true,
    diagnostics: {
      slugWasPlaceholder: Boolean(ingestDiag.slugWasPlaceholder),
      chosenAddressSource:
        typeof ingestDiag.chosenAddressSource === 'string' ? ingestDiag.chosenAddressSource : undefined,
    },
  })

  const gated = detectGatedListing({ sourceUrl, addressRaw: listing.addressRaw })
  if (gated.gated && addressLifecycle.addressStatus === 'address_gated') {
    recordDetailFirstFallback(metrics, 'gated_address')
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'gated_address',
    })
    return { result: { outcome: 'fallback', reason: 'gated_address' }, metrics }
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
    })
    return { result: { outcome: 'fallback', reason: spatialReason }, metrics }
  }

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

  const admin = getAdminDb()
  const timePayload = listing.rawPayload as { detailTimeStart?: string; detailTimeEnd?: string }
  const rowPayload = {
    ...params.rowPayload,
    detailFirstReady: true,
    detailFirstResolution: spatial.resolutionSource,
  }

  const { data: insertedRow, error: insErr } = await fromBase(admin, 'ingested_sales')
    .insert({
      source_platform: params.platform,
      source_url: listing.sourceUrl,
      external_id: (listing.rawPayload.externalId as string | null) ?? null,
      title: listing.title,
      description: listing.description,
      address_raw: listing.addressRaw,
      normalized_address: normalizedLine,
      city,
      state,
      zip_code: null,
      lat: spatial.lat,
      lng: spatial.lng,
      date_start: listing.startDate ?? null,
      date_end: listing.endDate ?? null,
      time_start: timePayload.detailTimeStart ?? null,
      time_end: timePayload.detailTimeEnd ?? null,
      date_source: dateSourceForDetailFirst(provenance),
      time_source: timePayload.detailTimeStart ? 'ystm_detail_page' : null,
      image_source_url: listing.imageSourceUrl,
      raw_text: null,
      raw_payload: rowPayload,
      status: 'ready',
      failure_reasons: [],
      parser_version: PARSER_VERSION_ROW,
      parse_confidence: 'high',
      is_duplicate: false,
      duplicate_of: null,
      geocode_confidence: spatial.geocode_confidence,
      coordinate_precision: spatial.coordinate_precision,
      geocode_method: spatial.geocode_method,
      ...addressLifecycleFieldsForDb({
        addressStatus: 'address_available',
        canonicalSourceUrl: addressLifecycle.canonicalSourceUrl,
        addressUnlockAt: addressLifecycle.addressUnlockAt,
        nextEnrichmentAttemptAt: null,
        ingestStatus: 'ready',
      }),
    })
    .select('id')
    .maybeSingle()

  if (insErr || !insertedRow?.id) {
    const insertReason =
      insErr && /duplicate key|unique constraint|23505/i.test(insErr.message)
        ? 'canonical_collision'
        : 'insert_failed'
    recordDetailFirstFallback(metrics, insertReason)
    finalizeDetailFirstAttemptMetrics(metrics)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: insertReason,
    })
    return { result: { outcome: 'fallback', reason: insertReason }, metrics }
  }

  metrics.succeeded = 1
  emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstSucceeded, telem, {
    resolutionSource: spatial.resolutionSource,
    ...validationTelemetry,
  })

  const publishResult = await publishReadyIngestedSaleById(String(insertedRow.id))
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
    result: { outcome: 'ready', ingestedSaleId: String(insertedRow.id), published },
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
