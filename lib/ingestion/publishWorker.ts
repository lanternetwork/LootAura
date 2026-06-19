import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { createPublishedSale, type PublishableIngestedSale } from '@/lib/ingestion/publish'
import {
  InsufficientAddressForPublishError,
  validateResolvedAddressForPublish,
} from '@/lib/ingestion/publishValidation'
import { FIXED_INGEST_OWNER_ID } from '@/lib/ingestion/fixedIngestOwnerId'
import { logger, type LogContext } from '@/lib/log'
import type { FailureReason } from '@/lib/ingestion/types'
import { sanitizeExternalImageUrls } from '@/lib/ingestion/externalImageValidation'
import { mergeSanitizedCloudinaryIntoPublishable } from '@/lib/ingestion/sanitizePublishCloudinaryFallback'
import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'
import { isCoordinatePrecisionPublishable } from '@/lib/geocode/geocodePrecisionPolicy'
import { isPublishingRowStaleReclaimBlockedByPastEndDateValidation } from '@/lib/ingestion/publishClaimStale'
import { extractPublishImageCandidates } from '@/lib/ingestion/publishImageCandidates'

export { extractPublishImageCandidates }
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { buildCanonicalLinkedSaleSchedulePatch } from '@/lib/reconciliation/canonicalLinkedSaleSchedulePatch'
import {
  computeImportedListingImageSyncIntent,
  looksGenericDescription,
  looksGenericTitle,
  looksPollutedDescription,
  mirrorIngestScheduleFieldsFromPublishedSalePhase2A,
  normalizeAddressForPublishSafe,
  normalizeTextOrNull,
} from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { classifyQueuePressure } from '@/lib/observability/metrics'
import {
  resolveCrossProviderPublishLink,
  type CrossProviderPublishLink,
} from '@/lib/ingestion/identity/resolveCrossProviderPublishLink'
import { propagateCrossProviderPublishToObservations } from '@/lib/ingestion/identity/propagateCrossProviderPublishToObservations'

export type PublishReadyByIdResult =
  | { ok: true; publishedSaleId: string }
  | { ok: true; skipped: true; reason: 'not_eligible' | 'past_end_date' | 'non_publishable_precision' }
  | { ok: false; error: string }

interface ClaimedPublishRow {
  id: string
  source_platform: string
  source_url: string
  title: string | null
  description: string | null
  normalized_address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  lat: number
  lng: number
  date_start: string
  date_end: string | null
  time_start: string | null
  time_end: string | null
  image_cloudinary_url: string | null
  published_sale_id?: string | null
  /** Present on direct/single select and new claim RPC; absent on older RPC versions until hydrated fallback runs. */
  image_source_url?: string | null
  raw_payload?: unknown
  failure_reasons: unknown
  /** Fetched after claim for stale-reclaim guardrails (not returned by claim RPC). */
  failure_details?: unknown
  /** Fetched after claim for Phase D cross-provider publish link (not returned by claim RPC). */
  canonical_sale_instance_key?: string | null
  is_duplicate?: boolean
  duplicate_of?: string | null
}

/** Batch publish worker: one count set per `publishReadyIngestedSales()` invocation. */
export interface PublishWorkerBatchSummary {
  /** Rows returned from claim RPC for this batch. */
  attempted: number
  /** Rows finalized as `published` (including idempotent duplicate-key reuse). */
  succeeded: number
  /** Operational failures only (`publish_failed`); excludes past-date `expired`. */
  failed: number
  /** Claimed rows not published (e.g. not eligible); batch path is usually 0. */
  skipped: number
  /** Rows closed as `expired` (past `date_end` vs UTC today). */
  expired: number
  /** Why `time_start` was normalized during publish for rows created in this batch. */
  timeStartNormalization: {
    source_preserved: number
    time_start_rounded: number
    time_start_missing_defaulted: number
    timezone_normalized: number
  }
}

export interface LinkedSaleFinalizeSummary {
  attempted: number
  finalized: number
  alreadyPublished: number
  linkMismatch: number
  missingLinkedSale: number
}

function parseBatchSize(): number {
  const raw = process.env.INGEST_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : 150
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 150
  }
  return Math.min(parsed, 500)
}

function parseLinkedSaleFinalizeBatchSize(): number {
  const raw = process.env.INGEST_LINKED_FINALIZE_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : 100
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100
  }
  return Math.min(parsed, 500)
}

function toFailureReasons(value: unknown): FailureReason[] {
  if (!Array.isArray(value)) return []
  return value.filter((reason): reason is FailureReason => typeof reason === 'string')
}

function appendFailureReason(reasons: FailureReason[], reason: FailureReason): FailureReason[] {
  if (reasons.includes(reason)) return reasons
  return [...reasons, reason]
}

/** Aligns with migration 166 / 165: drop publish_error, ensure sale_expired. */
function mergeFailureReasonsForExpiredCleanup(existingFailureReasons: unknown): FailureReason[] {
  const withoutPublishError = toFailureReasons(existingFailureReasons).filter((r) => r !== 'publish_error')
  return appendFailureReason(withoutPublishError, 'sale_expired')
}

/** Stored on `ingested_sales.failure_details` — no raw addresses, titles, or URLs (ops-safe region only). */
export type PublishFailureDetails = {
  publish_error: string
  phase: 'create_sale' | 'finalize_ingested_row' | 'validation' | 'linked_finalize_mismatch'
  operation: string
  reason?: 'past_end_date'
  original_date_end?: string
  region?: { city: string | null; state: string | null }
  /** Present when a `sales` row was created but ingested row could not be marked published. */
  published_sale_id?: string
}

function buildPublishFailureDetails(
  message: string,
  ctx: {
    phase: PublishFailureDetails['phase']
    operation: string
    reason?: PublishFailureDetails['reason']
    originalDateEnd?: string | null
    city?: string | null
    state?: string | null
    publishedSaleId?: string | null
  }
): PublishFailureDetails {
  const out: PublishFailureDetails = {
    publish_error: message,
    phase: ctx.phase,
    operation: ctx.operation,
  }
  if (ctx.reason) {
    out.reason = ctx.reason
  }
  if (ctx.originalDateEnd) {
    out.original_date_end = ctx.originalDateEnd
  }
  if (ctx.city != null || ctx.state != null) {
    out.region = { city: ctx.city ?? null, state: ctx.state ?? null }
  }
  if (ctx.publishedSaleId) {
    out.published_sale_id = ctx.publishedSaleId
  }
  return out
}

function logPublishFailureStructured(params: {
  rowId: string
  message: string
  phase: PublishFailureDetails['phase']
  operation: string
  city?: string | null
  state?: string | null
  saleId?: string | null
  reason?: PublishFailureDetails['reason']
  dateEnd?: string | null
}): void {
  const context: LogContext = {
    component: 'ingestion/publishWorker',
    operation: params.operation,
    phase: params.phase,
    rowId: params.rowId,
    city: params.city ?? undefined,
    state: params.state ?? undefined,
  }
  if (params.saleId) {
    context.saleId = params.saleId
  }
  if (params.reason) {
    context.reason = params.reason
  }
  if (params.dateEnd) {
    context.dateEnd = params.dateEnd
  }
  logger.error('ingested_sales publish failure', new Error(params.message), context)
}

function isTransientPublishFailureDetails(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const phase = (value as { phase?: unknown }).phase
  return phase === 'create_sale' || phase === 'finalize_ingested_row'
}

/**
 * Persists `publish_failed` payload only while the row is still `publishing`.
 * Retries once on transient errors; never updates by `id` alone (avoids clobbering
 * `ready` / `needs_geocode` / `published` after concurrent transitions).
 */
export async function tryPersistPublishFailedWhilePublishing(
  rowId: string,
  payload: Record<string, unknown>,
  logContext: { operation: string; phase: PublishFailureDetails['phase'] | 'sale_window' }
): Promise<boolean> {
  const admin = getAdminDb()
  for (let attempt = 0; attempt < 2; attempt++) {
    let error: { message: string } | null = null
    try {
      const result = await fromBase(admin, 'ingested_sales')
        .update(payload)
        .eq('id', rowId)
        .eq('status', 'publishing')
      error = result?.error ?? null
    } catch (thrown) {
      error = { message: thrown instanceof Error ? thrown.message : String(thrown) }
      logger.error(
        'tryPersistPublishFailedWhilePublishing guarded update threw',
        thrown instanceof Error ? thrown : new Error(String(thrown)),
        {
          component: 'ingestion/publishWorker',
          operation: logContext.operation,
          rowId,
          phase: logContext.phase,
          attempt: attempt + 1,
        }
      )
    }
    if (!error) {
      return true
    }
    if (attempt === 1) {
      logger.error(
        'tryPersistPublishFailedWhilePublishing failed after guarded retries',
        new Error(error.message),
        { component: 'ingestion/publishWorker', operation: logContext.operation, rowId, phase: logContext.phase }
      )
    }
  }
  return false
}

/**
 * Stuck `publishing` rows that already recorded validation `past_end_date` must become `expired`
 * without rewriting `failure_details` (historical cleanup: migration 166).
 */
async function tryPersistExpiredFromPublishingPreservingFailureDetails(
  rowId: string,
  existingFailureReasons: unknown,
  operation: string
): Promise<boolean> {
  const admin = getAdminDb()
  const failure_reasons = mergeFailureReasonsForExpiredCleanup(existingFailureReasons)
  for (let attempt = 0; attempt < 2; attempt++) {
    let error: { message: string } | null = null
    try {
      const result = await fromBase(admin, 'ingested_sales')
        .update({ status: 'expired', failure_reasons })
        .eq('id', rowId)
        .eq('status', 'publishing')
      error = result?.error ?? null
    } catch (thrown) {
      error = { message: thrown instanceof Error ? thrown.message : String(thrown) }
      logger.error(
        'tryPersistExpiredFromPublishingPreservingFailureDetails guarded update threw',
        thrown instanceof Error ? thrown : new Error(String(thrown)),
        {
          component: 'ingestion/publishWorker',
          operation,
          rowId,
          attempt: attempt + 1,
        }
      )
    }
    if (!error) {
      logger.info(
        'ingested_sales expired (legacy publishing validation past_end_date; failure_details preserved)',
        {
          component: 'ingestion/publishWorker',
          operation,
          rowId,
        }
      )
      return true
    }
    if (attempt === 1) {
      logger.error(
        'tryPersistExpiredFromPublishingPreservingFailureDetails failed after guarded retries',
        new Error(error.message),
        { component: 'ingestion/publishWorker', operation, rowId }
      )
    }
  }
  return false
}

function shouldClearFailureDetailsAfterLinkedFinalize(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const details = value as { publish_error?: unknown }
  if (typeof details.publish_error === 'string' && details.publish_error.trim().length > 0) {
    return true
  }
  return isTransientPublishFailureDetails(value)
}

type LinkedFinalizeCandidateRow = {
  id: string
  status: string
  published_sale_id: string | null
  published_at: string | null
  failure_reasons: unknown
  failure_details: unknown
}

type LinkedSaleRow = {
  id: string
  ingested_sale_id: string | null
}

function sanitizeFailureReasonsAfterLinkedFinalize(value: unknown): FailureReason[] | null {
  const reasons = toFailureReasons(value)
  const next = reasons.filter(
    (reason) => reason !== 'publish_error' && reason !== 'invalid_date' && reason !== 'sale_expired'
  )
  if (next.length === reasons.length) {
    return null
  }
  return next
}

export async function finalizeLinkedPublishedIngestedSales(
  options?: { batchSizeOverride?: number }
): Promise<LinkedSaleFinalizeSummary> {
  const admin = getAdminDb()
  const configuredBatch = parseLinkedSaleFinalizeBatchSize()
  const batchSizeCandidate = options?.batchSizeOverride
  const batchSize =
    typeof batchSizeCandidate === 'number' && Number.isFinite(batchSizeCandidate) && batchSizeCandidate > 0
      ? Math.min(Math.floor(batchSizeCandidate), 500)
      : configuredBatch

  const summary: LinkedSaleFinalizeSummary = {
    attempted: 0,
    finalized: 0,
    alreadyPublished: 0,
    linkMismatch: 0,
    missingLinkedSale: 0,
  }

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, status, published_sale_id, published_at, failure_reasons, failure_details')
    .not('published_sale_id', 'is', null)
    .neq('status', 'published')
    .order('updated_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    logger.error('Linked-sale finalization failed to load candidates', new Error(error.message), {
      component: 'ingestion/publishWorker',
      operation: 'linked_finalize_load',
      batchSize,
    })
    throw error
  }

  const rows = (Array.isArray(data) ? data : []) as LinkedFinalizeCandidateRow[]
  summary.attempted = rows.length

  for (const row of rows) {
    const linkedSaleId =
      typeof row.published_sale_id === 'string' && row.published_sale_id.trim().length > 0
        ? row.published_sale_id.trim()
        : null
    if (!linkedSaleId) {
      continue
    }

    const { data: linkedSaleRows, error: linkedSaleError } = await fromBase(admin, 'sales')
      .select('id, ingested_sale_id')
      .eq('id', linkedSaleId)
      .limit(1)

    if (linkedSaleError) {
      logger.error('Linked-sale finalization failed to load linked sale', new Error(linkedSaleError.message), {
        component: 'ingestion/publishWorker',
        operation: 'linked_finalize_validate_link',
        rowId: row.id,
        saleId: linkedSaleId,
      })
      summary.missingLinkedSale += 1
      continue
    }

    const linkedSale = Array.isArray(linkedSaleRows) && linkedSaleRows.length > 0
      ? (linkedSaleRows[0] as LinkedSaleRow)
      : null
    if (!linkedSale) {
      summary.missingLinkedSale += 1
      logger.error('Linked-sale finalization skipped due to missing linked sale', new Error('link_mismatch'), {
        component: 'ingestion/publishWorker',
        operation: 'linked_finalize_link_mismatch',
        rowId: row.id,
        saleId: linkedSaleId,
        reason: 'link_mismatch',
      })
      continue
    }

    if (linkedSale.ingested_sale_id !== row.id) {
      summary.linkMismatch += 1
      logger.error('Linked-sale finalization skipped due to mismatched sale linkage', new Error('link_mismatch'), {
        component: 'ingestion/publishWorker',
        operation: 'linked_finalize_link_mismatch',
        rowId: row.id,
        saleId: linkedSaleId,
        reason: 'link_mismatch',
      })
      const nextReasons =
        row.status === 'publish_failed' || row.status === 'expired'
          ? toFailureReasons(row.failure_reasons)
          : appendFailureReason(toFailureReasons(row.failure_reasons), 'publish_error')
      const mismatchDetails = buildPublishFailureDetails(
        'Linked sale ingested_sale_id does not match this ingested row; publish linkage cleared.',
        {
          phase: 'linked_finalize_mismatch',
          operation: 'linked_finalize_link_mismatch',
          publishedSaleId: linkedSaleId,
        }
      )
      await fromBase(admin, 'ingested_sales')
        .update({
          status: 'publish_failed',
          failure_reasons: nextReasons,
          published_sale_id: null,
          published_at: null,
          failure_details: mismatchDetails,
        })
        .eq('id', row.id)
        .neq('status', 'published')
      continue
    }

    const sanitizedReasons = sanitizeFailureReasonsAfterLinkedFinalize(row.failure_reasons)
    const shouldClearFailureDetails = shouldClearFailureDetailsAfterLinkedFinalize(row.failure_details)
    const payload: Record<string, unknown> = {
      status: 'published',
      published_at: row.published_at ?? new Date().toISOString(),
    }
    if (sanitizedReasons !== null) {
      payload.failure_reasons = sanitizedReasons
    }
    if (shouldClearFailureDetails) {
      payload.failure_details = null
    }

    const { error: updateError } = await fromBase(admin, 'ingested_sales')
      .update(payload)
      .eq('id', row.id)
      .eq('published_sale_id', linkedSaleId)
      .neq('status', 'published')

    if (updateError) {
      logger.error('Linked-sale finalization update failed', new Error(updateError.message), {
        component: 'ingestion/publishWorker',
        operation: 'linked_finalize_update',
        rowId: row.id,
        saleId: linkedSaleId,
      })
      continue
    }

    summary.finalized += 1
    logger.info('Linked-sale finalization completed', {
      component: 'ingestion/publishWorker',
      operation: 'linked_finalize_update',
      rowId: row.id,
      saleId: linkedSaleId,
    })
  }

  logger.info('Linked-sale finalization batch completed', {
    component: 'ingestion/publishWorker',
    operation: 'linked_finalize_batch_complete',
    ...summary,
    batchSize,
  })

  return summary
}

function utcTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Normalize Postgres `date` / ISO timestamp strings to `YYYY-MM-DD` for calendar compare and Zod publish. */
function coerceIngestedDateToYyyyMmDd(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return m?.[1] ?? null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return null
}

function hasPastEndDate(dateEnd: unknown): boolean {
  const d = coerceIngestedDateToYyyyMmDd(dateEnd)
  if (!d) return false
  const today = utcTodayDateString()
  return d < today
}

function isIngestedSaleIdUniqueViolation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  const pgCode =
    error && typeof error === 'object' && 'pgCode' in error
      ? String((error as { pgCode?: string }).pgCode ?? '')
      : ''
  if (pgCode !== '23505') return false
  return (
    msg.includes('idx_sales_ingested_sale_id_unique') ||
    (msg.includes('duplicate key') && msg.includes('ingested_sale_id'))
  )
}

async function fetchExistingSaleIdForIngested(ingestedSaleId: string): Promise<string | null> {
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'sales')
    .select('id')
    .eq('ingested_sale_id', ingestedSaleId)
    .limit(1)
  if (error || !data?.length) return null
  return (data[0] as { id: string }).id
}

async function linkedSaleIdForRow(record: ClaimedPublishRow): Promise<string | null> {
  const linkedId =
    typeof record.published_sale_id === 'string' && record.published_sale_id.trim()
      ? record.published_sale_id.trim()
      : null
  if (!linkedId) return null

  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'sales')
    .select('id')
    .eq('id', linkedId)
    .eq('ingested_sale_id', record.id)
    .limit(1)

  if (error || !Array.isArray(data) || data.length === 0) {
    logger.warn('Publish row has published_sale_id link but linked sale lookup failed; will continue with create/reuse path', {
      component: 'ingestion/publishWorker',
      operation: 'resolve_linked_sale_id',
      rowId: record.id,
      saleId: linkedId,
      city: record.city,
      state: record.state,
      message: error?.message,
    })
    return null
  }
  return linkedId
}

/** Same resolved line + checks as `createPublishedSale`; required for pre-linked idempotent rows. */
function validateClaimedRowResolvedAddress(record: ClaimedPublishRow): void {
  const city = normalizeTextOrNull(record.city) ?? ''
  const state = normalizeTextOrNull(record.state) ?? ''
  const normalizedAddress = normalizeAddressForPublishSafe(record.normalized_address, city, state)
  validateResolvedAddressForPublish(normalizedAddress, city, state)
}

async function sanitizePublishImagesForRecord(record: ClaimedPublishRow): Promise<string[]> {
  const hasRawField = Object.prototype.hasOwnProperty.call(record, 'raw_payload')
  const hasImageField = Object.prototype.hasOwnProperty.call(record, 'image_source_url')
  if (!hasRawField || !hasImageField) {
    logger.warn('Publish claim row missing expected media fields', {
      component: 'ingestion/publishWorker',
      operation: 'publish_claim_media_shape_check',
      rowId: record.id,
      hasRawPayloadField: hasRawField,
      hasImageSourceField: hasImageField,
    })
  }

  try {
    const candidates = extractPublishImageCandidates(record.raw_payload, record.image_source_url)
    if (candidates.length === 0 && hasRawField && hasImageField) {
      logger.info('Publish image candidate extraction produced zero candidates', {
        component: 'ingestion/publishWorker',
        operation: 'extract_publish_image_candidates',
        rowId: record.id,
        hasRawPayloadField: hasRawField,
        hasImageSourceField: hasImageField,
        imageSourceIsNull: record.image_source_url === null,
      })
    }
    const sanitized = await sanitizeExternalImageUrls(candidates, {
      rowId: record.id,
      city: record.city,
      state: record.state,
      max: MAX_IMPORTED_LISTING_IMAGES,
    })
    if (candidates.length > 0 && sanitized.length === 0) {
      logger.warn('Publish image candidates rejected by sanitizer; continuing without images', {
        component: 'ingestion/publishWorker',
        operation: 'sanitize_external_images',
        rowId: record.id,
        city: record.city,
        state: record.state,
        candidateCount: candidates.length,
      })
    }
    return sanitized
  } catch (error) {
    logger.warn('Publish image processing failed; continuing without images', {
      component: 'ingestion/publishWorker',
      operation: 'sanitize_external_images',
      rowId: record.id,
      city: record.city,
      state: record.state,
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/**
 * When a sale already exists (idempotent publish) or was inserted without media, fill
 * `cover_image_url` / `images` from sanitized ingest URLs only if both fields are empty.
 * Failures are logged; publish flow must not throw.
 */
async function maybeSyncExistingSaleFromLatestIngest(
  saleId: string,
  record: ClaimedPublishRow,
  sanitizedImages: string[],
  ctx: { rowId: string; city: string | null; state: string | null }
): Promise<void> {
  const city = normalizeTextOrNull(record.city)
  const state = normalizeTextOrNull(record.state)
  const normalizedAddress = normalizeAddressForPublishSafe(record.normalized_address, city ?? '', state ?? '')
  const normalizedDateStart = normalizeTextOrNull(record.date_start)
  const normalizedDateEnd = normalizeTextOrNull(record.date_end)
  const normalizedDescription = normalizeTextOrNull(record.description)
  const bestEffortPatch: Record<string, unknown> = {}

  if (normalizedAddress && city && state) {
    try {
      validateResolvedAddressForPublish(normalizedAddress, city, state)
      bestEffortPatch.address = formatAddressForPublishedSaleDisplay(normalizedAddress)
    } catch {
      /* omit low-quality ingest addresses from best-effort sale sync */
    }
  }
  const attemptBestEffortSync = async (reason: string): Promise<void> => {
    try {
      const payload: Record<string, unknown> = { ...bestEffortPatch }
      if (sanitizedImages.length > 0) {
        payload.cover_image_url = sanitizedImages[0]
        payload.images = sanitizedImages
      }
      if (Object.keys(payload).length === 0) return
      const admin = getAdminDb()
      const { error: fallbackErr } = await fromBase(admin, 'sales')
        .update(payload)
        .eq('id', saleId)
      if (fallbackErr) {
        logger.warn('Existing linked sale best-effort sync failed; continuing publish', {
          component: 'ingestion/publishWorker',
          operation: 'sync_existing_sale_from_ingest',
          rowId: ctx.rowId,
          saleId,
          city: ctx.city,
          state: ctx.state,
          reason,
          message: fallbackErr.message,
        })
      }
    } catch (fallbackError) {
      logger.warn('Existing linked sale best-effort sync threw; continuing publish', {
        component: 'ingestion/publishWorker',
        operation: 'sync_existing_sale_from_ingest',
        rowId: ctx.rowId,
        saleId,
        city: ctx.city,
        state: ctx.state,
        reason,
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      })
    }
  }

  try {
    const admin = getAdminDb()
    const { data, error } = await fromBase(admin, 'sales')
      .select(
        'ingested_sale_id, title, description, address, city, state, zip_code, lat, lng, date_start, date_end, time_start, time_end, cover_image_url, images, moderation_status'
      )
      .eq('id', saleId)
      .maybeSingle()

    if (error) {
      logger.warn('Existing linked sale sync skipped: load failed', {
        component: 'ingestion/publishWorker',
        operation: 'sync_existing_sale_from_ingest',
        rowId: ctx.rowId,
        saleId,
        city: ctx.city,
        state: ctx.state,
        message: error.message,
      })
      await attemptBestEffortSync('load_failed')
      return
    }

    const row = data as {
      ingested_sale_id: string | null
      title: string | null
      description: string | null
      address: string | null
      city: string | null
      state: string | null
      date_start: string | null
      date_end: string | null
      time_start: string | null
      time_end: string | null
      cover_image_url: string | null
      images: unknown
      moderation_status: string | null
      zip_code: string | null
      lat: number | null
      lng: number | null
    } | null
    if (!row) {
      return
    }
    if (row.moderation_status === 'hidden_by_admin') {
      logger.warn('Existing linked sale sync skipped: hidden_by_admin', {
        component: 'ingestion/publishWorker',
        operation: 'sync_existing_sale_from_ingest',
        rowId: ctx.rowId,
        saleId,
        city: ctx.city,
        state: ctx.state,
      })
      return
    }
    if (row.ingested_sale_id !== ctx.rowId) {
      logger.warn('Existing linked sale sync skipped: ingested row ownership mismatch', {
        component: 'ingestion/publishWorker',
        operation: 'sync_existing_sale_from_ingest',
        rowId: ctx.rowId,
        saleId,
        linkedIngestedSaleId: row.ingested_sale_id,
        city: ctx.city,
        state: ctx.state,
      })
      return
    }

    const normalizedTitle = normalizeTextOrNull(record.title) || `${record.city || 'Unknown'} Yard Sale`

    const patch: Record<string, unknown> = { ...bestEffortPatch }
    delete patch.images
    delete patch.cover_image_url
    const saleCity = normalizeTextOrNull(row.city) || city
    const saleState = normalizeTextOrNull(row.state) || state
    const existingAddressNormalized =
      saleCity && saleState
        ? normalizeAddressForPublishSafe(row.address, saleCity, saleState)
        : normalizeTextOrNull(row.address)
    if (existingAddressNormalized && saleCity && saleState) {
      try {
        validateResolvedAddressForPublish(existingAddressNormalized, saleCity, saleState)
        patch.address = formatAddressForPublishedSaleDisplay(existingAddressNormalized)
      } catch {
        /* do not write unvalidated or placeholder-normalized lines */
      }
    }

    if (looksGenericTitle(row.title, record.city)) {
      patch.title = normalizedTitle
    }
    if (normalizedDescription) {
      if (looksGenericDescription(row.description) || looksPollutedDescription(row.description)) {
        patch.description = normalizedDescription
      }
    }

    if (sanitizedImages.length > 0) {
      const intent = computeImportedListingImageSyncIntent({ sale: row, sanitizedImages })
      if (intent.kind === 'full') {
        patch.images = intent.images
        patch.cover_image_url = intent.cover_image_url
      } else if (intent.kind === 'cover_only') {
        patch.cover_image_url = intent.cover_image_url
      }
    }

    const parsedForSchedule =
      normalizedDateStart != null
        ? {
            title: normalizedTitle,
            description: normalizedDescription ?? '',
            imageUrls: [] as const,
            dateStart: normalizedDateStart,
            dateEnd: normalizedDateEnd ?? normalizedDateStart,
          }
        : null

    const schedulePatchResult = await buildCanonicalLinkedSaleSchedulePatch({
      admin,
      refreshedDescription: normalizedDescription,
      ingest: {
        date_start: record.date_start,
        date_end: record.date_end,
        time_start: record.time_start,
        time_end: record.time_end,
        raw_payload: record.raw_payload,
      },
      sale: {
        date_start: row.date_start,
        date_end: row.date_end,
        time_start: row.time_start,
        time_end: row.time_end,
      },
      parsed: parsedForSchedule,
      lat: Number(record.lat),
      lng: Number(record.lng),
      zip_code: row.zip_code ?? record.zip_code,
      state: row.state ?? record.state,
      rowId: ctx.rowId,
      saleId,
      operation: 'maybeSyncExistingSaleFromLatestIngest',
      skipWhenSaleMatchesBundle: true,
    })

    if (schedulePatchResult.scheduleMutationInhibited) {
      logger.warn('Linked sale schedule sync skipped', {
        component: 'ingestion/publishWorker',
        operation: 'sync_existing_sale_from_ingest_schedule',
        rowId: ctx.rowId,
        saleId,
        city: ctx.city,
        state: ctx.state,
        schedule_bundle_reason: schedulePatchResult.scheduleBundleReason,
        schedule_mutation_inhibited_reason: schedulePatchResult.scheduleMutationInhibitedReason,
      })
    }

    if (schedulePatchResult.schedulePatch) {
      Object.assign(patch, schedulePatchResult.schedulePatch)
    }

    if (Object.keys(patch).length === 0) {
      return
    }

    const { error: upErr } = await fromBase(admin, 'sales')
      .update(patch)
      .eq('id', saleId)

    if (!upErr && schedulePatchResult.schedulesUpdated) {
      await mirrorIngestScheduleFieldsFromPublishedSalePhase2A(admin, {
        ingestedSaleId: ctx.rowId,
        saleId,
        currentRawPayload: record.raw_payload,
      })
    }

    if (upErr) {
      logger.warn('Existing linked sale sync failed; continuing publish', {
        component: 'ingestion/publishWorker',
        operation: 'sync_existing_sale_from_ingest',
        rowId: ctx.rowId,
        saleId,
        city: ctx.city,
        state: ctx.state,
        message: upErr.message,
      })
    }
  } catch (error) {
    logger.warn('Existing linked sale sync raised unexpected error; continuing publish', {
      component: 'ingestion/publishWorker',
      operation: 'sync_existing_sale_from_ingest',
      rowId: ctx.rowId,
      saleId,
      city: ctx.city,
      state: ctx.state,
      message: error instanceof Error ? error.message : String(error),
    })
    await attemptBestEffortSync('unexpected_error')
  }
}

async function hydrateClaimedRowsRawPayload(rows: ClaimedPublishRow[]): Promise<ClaimedPublishRow[]> {
  if (rows.length === 0) return rows
  const fullyHydrated = rows.every(
    (row) =>
      Object.prototype.hasOwnProperty.call(row, 'raw_payload') &&
      Object.prototype.hasOwnProperty.call(row, 'image_source_url')
  )
  if (fullyHydrated) return rows

  const missingRawCount = rows.filter((row) => !Object.prototype.hasOwnProperty.call(row, 'raw_payload')).length
  const missingImageCount = rows.filter((row) => !Object.prototype.hasOwnProperty.call(row, 'image_source_url')).length
  logger.info('Publish worker media hydration fallback engaged', {
    component: 'ingestion/publishWorker',
    operation: 'hydrate_claimed_rows_media_fallback',
    rowCount: rows.length,
    missingRawPayloadCount: missingRawCount,
    missingImageSourceCount: missingImageCount,
  })

  const admin = getAdminDb()
  const ids = rows.map((row) => row.id)
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, raw_payload, image_source_url, published_sale_id')
    .in('id', ids)
  if (error || !Array.isArray(data)) {
    logger.warn('Publish worker media hydration fallback failed; proceeding without hydrated media fields', {
      component: 'ingestion/publishWorker',
      operation: 'hydrate_claimed_rows_media_fallback',
      rowCount: rows.length,
      hasArrayData: Array.isArray(data),
      message: error?.message ?? 'non_array_hydration_result',
    })
    return rows
  }
  const payloadById = new Map<
    string,
    { raw_payload: unknown; image_source_url: string | null; published_sale_id: string | null }
  >()
  for (const row of data as Array<{ id: string; raw_payload?: unknown; image_source_url?: string | null; published_sale_id?: string | null }>) {
    if (!row?.id) {
      logger.warn('Publish worker media hydration row missing id; skipping hydration row', {
        component: 'ingestion/publishWorker',
        operation: 'hydrate_claimed_rows_media_fallback',
      })
      continue
    }
    payloadById.set(row.id, {
      raw_payload: row.raw_payload ?? null,
      image_source_url: row.image_source_url ?? null,
      published_sale_id: row.published_sale_id ?? null,
    })
  }
  if (payloadById.size < rows.length) {
    logger.warn('Publish worker media hydration fallback returned fewer rows than requested', {
      component: 'ingestion/publishWorker',
      operation: 'hydrate_claimed_rows_media_fallback',
      requestedCount: rows.length,
      hydratedCount: payloadById.size,
    })
  }
  return rows.map((row) => {
    const extra = payloadById.get(row.id)
    const hasRawKey = Object.prototype.hasOwnProperty.call(row, 'raw_payload')
    const hasImgKey = Object.prototype.hasOwnProperty.call(row, 'image_source_url')
    const hasPubIdKey = Object.prototype.hasOwnProperty.call(row, 'published_sale_id')
    return {
      ...row,
      raw_payload: hasRawKey ? row.raw_payload ?? null : extra?.raw_payload ?? null,
      image_source_url: hasImgKey ? row.image_source_url ?? null : extra?.image_source_url ?? null,
      published_sale_id: hasPubIdKey ? row.published_sale_id ?? null : extra?.published_sale_id ?? null,
    }
  })
}

async function attachFailureDetailsToClaimedPublishRows(rows: ClaimedPublishRow[]): Promise<ClaimedPublishRow[]> {
  if (rows.length === 0) return rows
  const admin = getAdminDb()
  const ids = rows.map((r) => r.id)
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select(
      'id, failure_details, canonical_sale_instance_key, is_duplicate, duplicate_of'
    )
    .in('id', ids)
  if (error || !Array.isArray(data)) {
    logger.warn('Publish worker failure_details attach failed; stale reclaim guard may miss rows', {
      component: 'ingestion/publishWorker',
      operation: 'attach_failure_details_claimed_rows',
      rowCount: rows.length,
      message: error?.message ?? 'non_array_attach_result',
    })
    return rows
  }
  const byId = new Map<
    string,
    {
      failure_details: unknown
      canonical_sale_instance_key: string | null
      is_duplicate: boolean
      duplicate_of: string | null
    }
  >()
  for (const row of data as Array<{
    id?: string
    failure_details?: unknown
    canonical_sale_instance_key?: string | null
    is_duplicate?: boolean
    duplicate_of?: string | null
  }>) {
    if (row?.id) {
      byId.set(row.id, {
        failure_details: row.failure_details ?? null,
        canonical_sale_instance_key: row.canonical_sale_instance_key ?? null,
        is_duplicate: row.is_duplicate ?? false,
        duplicate_of: row.duplicate_of ?? null,
      })
    }
  }
  return rows.map((row) => {
    const extra = byId.get(row.id)
    if (!extra) return row
    return {
      ...row,
      failure_details: extra.failure_details,
      canonical_sale_instance_key: extra.canonical_sale_instance_key,
      is_duplicate: extra.is_duplicate,
      duplicate_of: extra.duplicate_of,
    }
  })
}

function claimedRowToPublishable(record: ClaimedPublishRow): PublishableIngestedSale {
  const dateStart = coerceIngestedDateToYyyyMmDd(record.date_start) ?? (record.date_start as string)
  const dateEnd = coerceIngestedDateToYyyyMmDd(record.date_end) ?? (record.date_end as string | null)
  return {
    id: record.id,
    owner_id: FIXED_INGEST_OWNER_ID,
    source_platform: record.source_platform,
    source_url: record.source_url,
    title: record.title,
    description: record.description,
    normalized_address: record.normalized_address,
    city: record.city,
    state: record.state,
    zip_code: record.zip_code,
    lat: Number(record.lat),
    lng: Number(record.lng),
    date_start: dateStart,
    date_end: dateEnd,
    time_start: record.time_start,
    time_end: record.time_end,
    image_cloudinary_url: record.image_cloudinary_url,
    image_urls: [],
  }
}

/** Insert sale or, on unique conflict for `ingested_sale_id`, reuse the existing row. */
async function tryCreatePublishedSaleOrReuseExisting(record: ClaimedPublishRow): Promise<{
  saleId: string
  timeStartNormalizationReason: 'source_preserved' | 'time_start_rounded' | 'time_start_missing_defaulted' | 'timezone_normalized'
}> {
  const body = claimedRowToPublishable(record)
  const sanitizedImages = await sanitizePublishImagesForRecord(record)
  if (sanitizedImages.length > 0) {
    body.image_urls = sanitizedImages
  }
  await mergeSanitizedCloudinaryIntoPublishable(body)

  const patchCtx = { rowId: record.id, city: record.city, state: record.state }
  let saleId: string
  let timeStartNormalizationReason: 'source_preserved' | 'time_start_rounded' | 'time_start_missing_defaulted' | 'timezone_normalized' =
    'source_preserved'
  try {
    const created = await createPublishedSale(body)
    saleId = created.saleId
    timeStartNormalizationReason =
      created.diagnostics?.timeStartNormalizationReason ?? 'source_preserved'
  } catch (err) {
    if (!isIngestedSaleIdUniqueViolation(err)) throw err
    const existing = await fetchExistingSaleIdForIngested(record.id)
    if (!existing) throw err
    saleId = existing
    logger.info('publish idempotent: resolved existing sale for ingested row', {
      component: 'ingestion/publishWorker',
      operation: 'reuse_existing_sale',
      rowId: record.id,
      saleId: existing,
    })
  }

  await maybeSyncExistingSaleFromLatestIngest(saleId, record, sanitizedImages, patchCtx)
  return { saleId, timeStartNormalizationReason }
}

type PublishSaleResolution = {
  saleId: string
  crossProviderLink: CrossProviderPublishLink | null
  reusedExistingLinkedSale: boolean
  timeStartNormalizationReason: 'source_preserved' | 'time_start_rounded' | 'time_start_missing_defaulted' | 'timezone_normalized'
}

async function resolveSaleIdForPublishClaim(record: ClaimedPublishRow): Promise<PublishSaleResolution> {
  const linkedSaleId = await linkedSaleIdForRow(record)
  if (linkedSaleId) {
    return {
      saleId: linkedSaleId,
      crossProviderLink: null,
      reusedExistingLinkedSale: true,
      timeStartNormalizationReason: 'source_preserved',
    }
  }

  const crossProviderLink = await resolveCrossProviderPublishLink({
    id: record.id,
    source_platform: record.source_platform,
    canonical_sale_instance_key: record.canonical_sale_instance_key,
  })
  if (crossProviderLink) {
    return {
      saleId: crossProviderLink.publishedSaleId,
      crossProviderLink,
      reusedExistingLinkedSale: false,
      timeStartNormalizationReason: 'source_preserved',
    }
  }

  const created = await tryCreatePublishedSaleOrReuseExisting(record)
  return {
    saleId: created.saleId,
    crossProviderLink: null,
    reusedExistingLinkedSale: false,
    timeStartNormalizationReason: created.timeStartNormalizationReason,
  }
}

function buildPublishedIngestedRowUpdatePayload(
  saleId: string,
  crossProviderLink: CrossProviderPublishLink | null
): Record<string, unknown> {
  const base = {
    status: 'published' as const,
    published_sale_id: saleId,
    published_at: new Date().toISOString(),
  }
  if (crossProviderLink) {
    return {
      ...base,
      is_duplicate: true,
      duplicate_of: crossProviderLink.primaryIngestedSaleId,
    }
  }
  return base
}

async function completeCrossProviderPublishSideEffects(
  record: ClaimedPublishRow,
  saleId: string,
  crossProviderLink: CrossProviderPublishLink | null
): Promise<void> {
  if (crossProviderLink) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.crossProviderPublishLinked, {
        rowId: record.id,
        sourcePlatform: record.source_platform,
        publishedSaleId: saleId,
        primaryIngestedSaleId: crossProviderLink.primaryIngestedSaleId,
        matchedIngestedSaleId: crossProviderLink.matchedIngestedSaleId,
        matchMethod: crossProviderLink.matchMethod,
      })
    )
  }

  const canonicalKey = record.canonical_sale_instance_key?.trim()
  if (!canonicalKey) return

  const primaryIngestedSaleId = crossProviderLink?.primaryIngestedSaleId ?? record.id
  await propagateCrossProviderPublishToObservations({
    canonicalSaleInstanceKey: canonicalKey,
    publishedSaleId: saleId,
    primaryIngestedSaleId,
    excludeIngestedSaleId: record.id,
  })
}

/**
 * When `createPublishedSale` throws before any sale id: row is still `publishing`.
 * Persists `publish_failed` + `failure_details` and logs (non-silent).
 */
async function markIngestedPublishFailedFromSaleCreateError(
  rowId: string,
  existingFailureReasons: unknown,
  error: unknown,
  operation: string,
  city: string | null,
  state: string | null
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const primaryFailure: FailureReason =
    error instanceof InsufficientAddressForPublishError ? 'invalid_address_format' : 'publish_error'
  const mergedReasons = appendFailureReason(toFailureReasons(existingFailureReasons), primaryFailure)
  const payload = {
    status: 'publish_failed' as const,
    failure_reasons: mergedReasons,
    failure_details: buildPublishFailureDetails(message, {
      phase: 'create_sale',
      operation,
      city,
      state,
    }),
  }

  logPublishFailureStructured({
    rowId,
    message,
    phase: 'create_sale',
    operation,
    city,
    state,
  })

  const persisted = await tryPersistPublishFailedWhilePublishing(rowId, payload, {
    operation,
    phase: 'create_sale',
  })
  if (!persisted) {
    logger.error(
      'Failed to persist publish_failed after createPublishedSale error (row not in publishing or DB error)',
      new Error(message),
      { component: 'ingestion/publishWorker', operation, rowId, phase: 'create_sale' }
    )
  }
}

/** Past listing window: terminal `expired`, not operational `publish_failed`. */
async function markIngestedExpiredPastEndDate(
  rowId: string,
  existingFailureReasons: unknown,
  operation: string,
  city: string | null,
  state: string | null,
  dateEnd: string | null | undefined
): Promise<void> {
  const today = utcTodayDateString()
  const mergedReasons = appendFailureReason(toFailureReasons(existingFailureReasons), 'sale_expired')
  const dateEndDay = coerceIngestedDateToYyyyMmDd(dateEnd) ?? String(dateEnd)
  const payload = {
    status: 'expired' as const,
    failure_reasons: mergedReasons,
    failure_details: {
      kind: 'ingestion_expired' as const,
      reason: 'past_end_date' as const,
      message: `listing date_end ${dateEndDay} is before ${today} (UTC calendar compare)`,
      original_date_end: dateEndDay,
      reference_today_utc: today,
      operation,
      region: { city: city ?? null, state: state ?? null },
    },
  }

  logger.info('ingested_sales expired (past date_end)', {
    component: 'ingestion/publishWorker',
    operation,
    rowId,
    dateEnd: dateEndDay,
    city: city ?? undefined,
    state: state ?? undefined,
  })

  const persisted = await tryPersistPublishFailedWhilePublishing(rowId, payload, {
    operation,
    phase: 'sale_window',
  })
  if (!persisted) {
    logger.error(
      'markIngestedExpiredPastEndDate could not persist expired (row not in publishing or DB error)',
      new Error(`past_end_date ${dateEndDay}`),
      { component: 'ingestion/publishWorker', operation, rowId, phase: 'sale_window', reason: 'past_end_date' }
    )
  }
}

/** After a sale row exists, never leave ingested_sales stuck in `publishing`. */
async function markIngestedPublishFailedFromPublishing(
  rowId: string,
  existingFailureReasons: unknown,
  errorMessage: string,
  operation: string,
  city: string | null,
  state: string | null,
  publishedSaleId: string | null = null
): Promise<void> {
  const mergedReasons = appendFailureReason(toFailureReasons(existingFailureReasons), 'publish_error')
  const payload = {
    status: 'publish_failed' as const,
    failure_reasons: mergedReasons,
    failure_details: buildPublishFailureDetails(errorMessage, {
      phase: 'finalize_ingested_row',
      operation,
      city,
      state,
      publishedSaleId,
    }),
  }

  logPublishFailureStructured({
    rowId,
    message: errorMessage,
    phase: 'finalize_ingested_row',
    operation,
    city,
    state,
    saleId: publishedSaleId,
  })

  const persisted = await tryPersistPublishFailedWhilePublishing(rowId, payload, {
    operation,
    phase: 'finalize_ingested_row',
  })
  if (!persisted) {
    logger.error(
      'markIngestedPublishFailedFromPublishing could not persist publish_failed (row not in publishing or DB error)',
      new Error(errorMessage),
      { component: 'ingestion/publishWorker', operation, rowId, critical: true }
    )
  }
}

/**
 * Idempotent publish for a single ingestion row: claims ready -> publishing, inserts sale, marks published.
 * Safe if cron publish already processed the row (returns skipped).
 */
export async function publishReadyIngestedSaleById(ingestedSaleId: string): Promise<PublishReadyByIdResult> {
  const admin = getAdminDb()

  const { data: row, error: claimError } = await fromBase(admin, 'ingested_sales')
    .update({ status: 'publishing' })
    .eq('id', ingestedSaleId)
    .eq('status', 'ready')
    .eq('is_duplicate', false)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .select(
      'id, source_platform, source_url, title, description, normalized_address, city, state, zip_code, lat, lng, date_start, date_end, time_start, time_end, image_cloudinary_url, image_source_url, raw_payload, published_sale_id, failure_reasons, coordinate_precision, canonical_sale_instance_key, is_duplicate, duplicate_of'
    )
    .maybeSingle()

  if (claimError) {
    logger.error(
      'publishReadyIngestedSaleById claim failed',
      new Error(claimError.message),
      { component: 'ingestion/publishWorker', operation: 'claim_single', ingestedSaleId }
    )
    return { ok: false, error: claimError.message }
  }

  if (!row) {
    return { ok: true, skipped: true, reason: 'not_eligible' }
  }

  const claimed = row as unknown as ClaimedPublishRow & {
    coordinate_precision?: string | null
  }
  if (!isCoordinatePrecisionPublishable(claimed.coordinate_precision)) {
    await fromBase(admin, 'ingested_sales')
      .update({ status: 'needs_check' })
      .eq('id', ingestedSaleId)
      .eq('status', 'publishing')
    return { ok: true, skipped: true, reason: 'non_publishable_precision' }
  }
  if (hasPastEndDate(claimed.date_end)) {
    await markIngestedExpiredPastEndDate(
      claimed.id,
      claimed.failure_reasons,
      'validate_end_date_single',
      claimed.city,
      claimed.state,
      claimed.date_end as string
    )
    return { ok: true, skipped: true, reason: 'past_end_date' }
  }

  let createdSaleId: string | null = null
  let publishFailureOperation: string = 'create_sale_single'

  try {
    const sanitizedImages = await sanitizePublishImagesForRecord(claimed)
    const resolution = await resolveSaleIdForPublishClaim(claimed)
    const { saleId, crossProviderLink, reusedExistingLinkedSale } = resolution
    createdSaleId = saleId
    if (reusedExistingLinkedSale) {
      publishFailureOperation = 'linked_address_validation_single'
      validateClaimedRowResolvedAddress(claimed)
    } else if (crossProviderLink) {
      publishFailureOperation = 'cross_provider_publish_link_single'
    }
    if (reusedExistingLinkedSale || crossProviderLink) {
      await maybeSyncExistingSaleFromLatestIngest(saleId, claimed, sanitizedImages, {
        rowId: claimed.id,
        city: claimed.city,
        state: claimed.state,
      })
    }

    const updatePayload = buildPublishedIngestedRowUpdatePayload(saleId, crossProviderLink)
    const firstUpdate = await fromBase(admin, 'ingested_sales').update(updatePayload).eq('id', claimed.id)
    if (firstUpdate.error) {
      const secondUpdate = await fromBase(admin, 'ingested_sales').update(updatePayload).eq('id', claimed.id)
      if (secondUpdate.error) {
        logger.error(
          'publishReadyIngestedSaleById failed to finalize ingested row after sale create',
          new Error(secondUpdate.error.message),
          {
            component: 'ingestion/publishWorker',
            operation: 'mark_published_retry_exhausted',
            rowId: claimed.id,
            saleId,
          }
        )
        await markIngestedPublishFailedFromPublishing(
          claimed.id,
          claimed.failure_reasons,
          secondUpdate.error.message,
          'finalize_after_sale_create_single',
          claimed.city,
          claimed.state,
          saleId
        )
        return { ok: false, error: secondUpdate.error.message }
      }
    }

    await completeCrossProviderPublishSideEffects(claimed, saleId, crossProviderLink)

    if (claimed.source_platform === 'external_page_source' && claimed.source_url) {
      try {
        const { upsertYstmCoverageObservationFromPublishHook } = await import(
          '@/lib/ingestion/ystmCoverage/discoveryFreshness/ystmCoverageLifecycleTimestamps'
        )
        await upsertYstmCoverageObservationFromPublishHook(admin, {
          sourceUrl: claimed.source_url,
          publishedAt: updatePayload.published_at as string,
          saleId,
          ingestedSaleId: claimed.id,
          city: claimed.city,
          state: claimed.state,
        })
      } catch (lifecycleError) {
        logger.warn('Failed to mark coverage observation first published timestamp', {
          component: 'ingestion/publishWorker',
          rowId: claimed.id,
          message: lifecycleError instanceof Error ? lifecycleError.message : String(lifecycleError),
        })
      }
    }

    logger.info('publishReadyIngestedSaleById completed', {
      component: 'ingestion/publishWorker',
      operation: 'single_complete',
      rowId: claimed.id,
      saleId,
      crossProviderPublishLink: Boolean(crossProviderLink),
    })

    return { ok: true, publishedSaleId: saleId }
  } catch (error) {
    if (createdSaleId) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(
        'publishReadyIngestedSaleById sale created but finalization failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'ingestion/publishWorker',
          operation: 'single_failure_after_sale_create',
          rowId: claimed.id,
          saleId: createdSaleId,
        }
      )
      await markIngestedPublishFailedFromPublishing(
        claimed.id,
        claimed.failure_reasons,
        message,
        'catch_after_sale_create_single',
        claimed.city,
        claimed.state,
        createdSaleId
      )
      return { ok: false, error: message }
    }

    await markIngestedPublishFailedFromSaleCreateError(
      claimed.id,
      claimed.failure_reasons,
      error,
      publishFailureOperation,
      claimed.city,
      claimed.state
    )

    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function publishReadyIngestedSales(options?: {
  telemetryContext?: Record<string, unknown>
  batchSizeOverride?: number
}): Promise<PublishWorkerBatchSummary> {
  const admin = getAdminDb()
  const batchCandidate = options?.batchSizeOverride
  const batchSize =
    typeof batchCandidate === 'number' && Number.isFinite(batchCandidate) && batchCandidate > 0
      ? Math.min(Math.floor(batchCandidate), 500)
      : parseBatchSize()
  const publishStartedAt = Date.now()

  const { data, error } = await (admin as any).rpc('claim_ingested_sales_for_publish', {
    p_batch_size: batchSize,
  })

  if (error) {
    logger.error('Failed to claim rows for publish worker', new Error(error.message), {
      component: 'ingestion/publishWorker',
      operation: 'claim_rows',
      batchSize,
    })
    throw error
  }

  const hydrated = await hydrateClaimedRowsRawPayload((Array.isArray(data) ? data : []) as ClaimedPublishRow[])
  const claimedRows = await attachFailureDetailsToClaimedPublishRows(hydrated)
  const summary: PublishWorkerBatchSummary = {
    attempted: claimedRows.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    expired: 0,
    timeStartNormalization: {
      source_preserved: 0,
      time_start_rounded: 0,
      time_start_missing_defaulted: 0,
      timezone_normalized: 0,
    },
  }

  for (const row of claimedRows) {
    if (isPublishingRowStaleReclaimBlockedByPastEndDateValidation(row.failure_details)) {
      const closed = await tryPersistExpiredFromPublishingPreservingFailureDetails(
        row.id,
        row.failure_reasons,
        'legacy_validation_past_end_date_batch'
      )
      if (closed) {
        summary.expired += 1
      } else {
        summary.failed += 1
      }
      continue
    }

    if (hasPastEndDate(row.date_end)) {
      await markIngestedExpiredPastEndDate(
        row.id,
        row.failure_reasons,
        'validate_end_date_batch',
        row.city,
        row.state,
        row.date_end as string
      )
      summary.expired += 1
      continue
    }

    if (!isCoordinatePrecisionPublishable((row as { coordinate_precision?: string | null }).coordinate_precision)) {
      await fromBase(admin, 'ingested_sales')
        .update({ status: 'needs_check' })
        .eq('id', row.id)
        .eq('status', 'publishing')
      summary.skipped += 1
      continue
    }

    let createdSaleId: string | null = null
    let publishFailureOperation: string = 'create_sale_batch'
    try {
      const sanitizedImages = await sanitizePublishImagesForRecord(row)
      const resolution = await resolveSaleIdForPublishClaim(row)
      const { saleId, crossProviderLink, reusedExistingLinkedSale, timeStartNormalizationReason } = resolution
      createdSaleId = saleId
      if (reusedExistingLinkedSale) {
        publishFailureOperation = 'linked_address_validation_batch'
        validateClaimedRowResolvedAddress(row)
      } else if (crossProviderLink) {
        publishFailureOperation = 'cross_provider_publish_link_batch'
      }
      if (reusedExistingLinkedSale || crossProviderLink) {
        await maybeSyncExistingSaleFromLatestIngest(saleId, row, sanitizedImages, {
          rowId: row.id,
          city: row.city,
          state: row.state,
        })
      }

      const updatePayload = buildPublishedIngestedRowUpdatePayload(saleId, crossProviderLink)
      const firstUpdate = await fromBase(admin, 'ingested_sales')
        .update(updatePayload)
        .eq('id', row.id)
      if (firstUpdate.error) {
        const secondUpdate = await fromBase(admin, 'ingested_sales')
          .update(updatePayload)
          .eq('id', row.id)
        if (secondUpdate.error) {
          logger.error(
            'Publish worker created sale but failed to update ingested row after retry',
            new Error(secondUpdate.error.message),
            {
              component: 'ingestion/publishWorker',
              operation: 'mark_published_retry_exhausted',
              rowId: row.id,
              saleId,
            }
          )
          await markIngestedPublishFailedFromPublishing(
            row.id,
            row.failure_reasons,
            secondUpdate.error.message,
            'finalize_after_sale_create_batch',
            row.city,
            row.state,
            saleId
          )
          summary.failed += 1
          continue
        }
      }

      await completeCrossProviderPublishSideEffects(row, saleId, crossProviderLink)

      summary.succeeded += 1
      const normalizationReason = timeStartNormalizationReason
      if (normalizationReason && normalizationReason in summary.timeStartNormalization) {
        summary.timeStartNormalization[normalizationReason] += 1
      }
      logger.info('Publish worker row processed', {
        component: 'ingestion/publishWorker',
        operation: 'row_result',
        rowId: row.id,
        result: 'success',
        crossProviderPublishLink: Boolean(crossProviderLink),
      })
    } catch (error) {
      summary.failed += 1
      if (createdSaleId) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(
          'Publish worker sale was created but row finalization failed before publish_failed transition',
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'ingestion/publishWorker',
            operation: 'row_result',
            rowId: row.id,
            saleId: createdSaleId,
            result: 'failure_after_sale_create',
          }
        )
        await markIngestedPublishFailedFromPublishing(
          row.id,
          row.failure_reasons,
          message,
          'catch_after_sale_create_batch',
          row.city,
          row.state,
          createdSaleId
        )
        continue
      }

      await markIngestedPublishFailedFromSaleCreateError(
        row.id,
        row.failure_reasons,
        error,
        publishFailureOperation,
        row.city,
        row.state
      )
    }
  }

  logger.info('Publish worker completed batch', {
    component: 'ingestion/publishWorker',
    operation: 'batch_complete',
    attempted: summary.attempted,
    succeeded: summary.succeeded,
    failed: summary.failed,
    skipped: summary.skipped,
    expired: summary.expired,
    timeStartNormalization: summary.timeStartNormalization,
  })

  const durationMs = Date.now() - publishStartedAt
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.publish.batchCompleted, {
      ...(options?.telemetryContext ?? {}),
      batchSize,
      attempted: summary.attempted,
      succeeded: summary.succeeded,
      failed: summary.failed,
      skipped: summary.skipped,
      expired: summary.expired,
      rowsProcessed: summary.succeeded + summary.failed + summary.skipped + summary.expired,
      durationMs,
      queuePressureClass: classifyQueuePressure(summary.attempted, Math.max(1, batchSize)),
      jobType: 'publish.db_claim_batch',
      timeStartNormalization: summary.timeStartNormalization,
    })
  )

  return summary
}

