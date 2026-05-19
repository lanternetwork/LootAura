import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  fetchExternalPageSource,
  parseExternalPageSourceHtml,
  type ExternalPageSourceIngestionConfig,
  type ExternalPageSourceListing,
} from '@/lib/ingestion/adapters/externalPageSource'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { extractDetailPageAddressFromHtml } from '@/lib/ingestion/address/extractDetailPageAddress'
import { detectGatedListing } from '@/lib/ingestion/address/addressGated'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import {
  addressLifecycleFieldsForDb,
  resolveIngestAddressLifecycle,
} from '@/lib/ingestion/address/resolveIngestAddressLifecycle'
import { extractYstmDetailMediaStrFromHtml } from '@/lib/ingestion/images/extractYstmDetailMediaStr'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { publishReadyIngestedSaleById } from '@/lib/ingestion/publishWorker'
import {
  InsufficientAddressForPublishError,
  validateResolvedAddressForPublish,
} from '@/lib/ingestion/publishValidation'
import { classifyDetailFirstSpatialFailure } from '@/lib/ingestion/acquisition/classifyDetailFirstSpatialFailure'
import type { YstmDetailFirstFallbackReason } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'
import { extractAuthoritativeSaleHourRangeFromText } from '@/lib/ingestion/saleHourRangeFromText'
import {
  coerceIngestedDateToYyyyMmDd,
  isSaleWindowExpiredAtDiscovery,
} from '@/lib/ingestion/saleWindowDates'
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
}

function bumpRejected(metrics: YstmDetailFirstRunMetrics, reason: YstmDetailFirstFallbackReason): void {
  metrics.rejectedByReason[reason] = (metrics.rejectedByReason[reason] ?? 0) + 1
}

function classifyAddressPublishFailure(
  normalizedPublish: string,
  city: string,
  state: string
): YstmDetailFirstFallbackReason {
  try {
    validateResolvedAddressForPublish(normalizedPublish, city, state)
    return 'address_validation_failed'
  } catch (err) {
    if (err instanceof InsufficientAddressForPublishError) {
      const msg = err.message.toLowerCase()
      if (msg.includes('lacks a resolvable street') || msg.includes('street detail required')) {
        return 'missing_street_number'
      }
    }
    return 'address_validation_failed'
  }
}

function hasValidDatetime(start: unknown, end: unknown): boolean {
  return coerceIngestedDateToYyyyMmDd(start) != null || coerceIngestedDateToYyyyMmDd(end) != null
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
 * Parse a YSTM detail page into a listing row (anchors, or list seed + detail enrichment).
 */
export function parseYstmDetailListingFromHtml(input: {
  html: string
  sourceUrl: string
  config: ExternalPageSourceIngestionConfig
  listSeed: ExternalPageSourceListing
}): ExternalPageSourceListing | null {
  const parsed = parseExternalPageSourceHtml(input.html, input.config, input.sourceUrl)
  const target = canonicalSourceUrl(input.sourceUrl)
  let detailMatch =
    parsed.listings.find((l) => canonicalSourceUrl(l.sourceUrl) === target) ??
    (parsed.listings.length === 1 ? parsed.listings[0]! : null)

  const addrFromDetail = extractDetailPageAddressFromHtml({
    html: input.html,
    sourceUrl: input.sourceUrl,
    city: input.listSeed.city,
    state: input.listSeed.state,
    sourcePlatform: input.config.source_platform,
  })

  if (detailMatch) {
    if (addrFromDetail.addressRaw?.trim()) {
      detailMatch = { ...detailMatch, addressRaw: addrFromDetail.addressRaw }
    }
  } else {
    const path = parseYstmListingPathParts(input.sourceUrl)
    if (!path) return null
    detailMatch = {
      ...input.listSeed,
      addressRaw: addrFromDetail.addressRaw ?? input.listSeed.addressRaw,
    }
  }

  const merged = mergeListingFields(input.listSeed, detailMatch)

  const media = extractYstmDetailMediaStrFromHtml(input.html, input.sourceUrl)
  if (media.imageUrls.length > 0) {
    merged.imageSourceUrl = media.imageUrls[0] ?? merged.imageSourceUrl
    merged.rawPayload = { ...merged.rawPayload, imageUrls: media.imageUrls }
  }

  const hourRange = extractAuthoritativeSaleHourRangeFromText(
    [merged.description, merged.title, merged.addressRaw].filter(Boolean).join('\n')
  )
  if (hourRange) {
    merged.rawPayload = {
      ...merged.rawPayload,
      detailTimeStart: hourRange.timeStart,
      detailTimeEnd: hourRange.timeEnd,
    }
  }

  return merged
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
    metrics.fallback = 1
    bumpRejected(metrics, 'parse_no_listing')
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
    metrics.fallback = 1
    bumpRejected(metrics, 'fetch_failed')
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
    metrics.fallback = 1
    bumpRejected(metrics, 'parse_no_listing')
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: 'parse_no_listing',
    })
    return { result: { outcome: 'fallback', reason: 'parse_no_listing' }, metrics }
  }

  if (isSaleWindowExpiredAtDiscovery(listing.startDate, listing.endDate)) {
    metrics.fallback = 1
    bumpRejected(metrics, 'expired_after_detail')
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'expired_after_detail',
    })
    return { result: { outcome: 'fallback', reason: 'expired_after_detail' }, metrics }
  }

  if (!listing.title?.trim()) {
    metrics.fallback = 1
    bumpRejected(metrics, 'missing_title')
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'missing_title',
    })
    return { result: { outcome: 'fallback', reason: 'missing_title' }, metrics }
  }

  if (!hasValidDatetime(listing.startDate, listing.endDate)) {
    metrics.fallback = 1
    bumpRejected(metrics, 'invalid_dates')
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'invalid_dates',
    })
    return { result: { outcome: 'fallback', reason: 'invalid_dates' }, metrics }
  }

  const city = listing.city?.trim() ?? ''
  const state = listing.state?.trim() ?? ''
  if (!city || !state || !isAddressGeocodeReady(listing.addressRaw)) {
    metrics.fallback = 1
    bumpRejected(metrics, 'address_validation_failed')
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'address_validation_failed',
    })
    return { result: { outcome: 'fallback', reason: 'address_validation_failed' }, metrics }
  }

  const normalizedLine = listing.addressRaw!.toLowerCase().replace(/\s+/g, ' ')
  const normalizedPublish = normalizeAddressForPublish(normalizedLine, city, state)
  if (!normalizedPublish) {
    metrics.fallback = 1
    bumpRejected(metrics, 'address_validation_failed')
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'address_validation_failed',
    })
    return { result: { outcome: 'fallback', reason: 'address_validation_failed' }, metrics }
  }
  try {
    validateResolvedAddressForPublish(normalizedPublish, city, state)
  } catch {
    metrics.fallback = 1
    const publishFailReason = classifyAddressPublishFailure(normalizedPublish, city, state)
    bumpRejected(metrics, publishFailReason)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: publishFailReason,
    })
    return { result: { outcome: 'fallback', reason: publishFailReason }, metrics }
  }

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
    metrics.fallback = 1
    bumpRejected(metrics, 'gated_address')
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
    metrics.fallback = 1
    const spatialReason = await classifyDetailFirstSpatialFailure({
      addressRaw: listing.addressRaw,
      normalizedAddress: normalizedLine,
      city,
      state,
      sourceUrl,
      pageHtml: html,
    })
    bumpRejected(metrics, spatialReason)
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
      date_source: listing.startDate ? 'ystm_detail_page' : null,
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
    metrics.fallback = 1
    const insertReason =
      insErr && /duplicate key|unique constraint|23505/i.test(insErr.message)
        ? 'canonical_collision'
        : 'insert_failed'
    bumpRejected(metrics, insertReason)
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstFallback, telem, {
      rejectedReason: insertReason,
    })
    return { result: { outcome: 'fallback', reason: insertReason }, metrics }
  }

  metrics.succeeded = 1
  emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstSucceeded, telem, {
    resolutionSource: spatial.resolutionSource,
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
    bumpRejected(metrics, 'publish_failed')
    emitDetailFirstEvent(ObservabilityEvents.ingestion.ystmDetailFirstRejectedReason, telem, {
      rejectedReason: 'publish_failed',
    })
  }

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
