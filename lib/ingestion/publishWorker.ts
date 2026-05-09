import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { createPublishedSale, type PublishableIngestedSale } from '@/lib/ingestion/publish'
import {
  InsufficientAddressForPublishError,
  validateResolvedAddressForPublish,
} from '@/lib/ingestion/publishValidation'
import { FIXED_INGEST_OWNER_ID } from '@/lib/ingestion/fixedIngestOwnerId'
import { uspsCodeToFullNameForAddress } from '@/lib/ingestion/adapters/usStateListPathSegment'
import { logger, type LogContext } from '@/lib/log'
import type { FailureReason } from '@/lib/ingestion/types'
import { sanitizeExternalImageUrls } from '@/lib/ingestion/externalImageValidation'

export type PublishReadyByIdResult =
  | { ok: true; publishedSaleId: string }
  | { ok: true; skipped: true; reason: 'not_eligible' }
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
}

/** Batch publish worker: one count set per `publishReadyIngestedSales()` invocation. */
export interface PublishWorkerBatchSummary {
  /** Rows returned from claim RPC for this batch. */
  attempted: number
  /** Rows finalized as `published` (including idempotent duplicate-key reuse). */
  succeeded: number
  /** Rows in `publish_failed` or unrecoverable finalize errors after claim. */
  failed: number
  /** Claimed rows not published (e.g. not eligible); batch path is usually 0. */
  skipped: number
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

/** Stored on `ingested_sales.failure_details` — no raw addresses, titles, or URLs (ops-safe region only). */
export type PublishFailureDetails = {
  publish_error: string
  phase: 'create_sale' | 'finalize_ingested_row' | 'validation'
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
  const next = reasons.filter((reason) => reason !== 'publish_error' && reason !== 'invalid_date')
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
      if (row.status !== 'publish_failed') {
        const nextReasons = appendFailureReason(toFailureReasons(row.failure_reasons), 'publish_error')
        await fromBase(admin, 'ingested_sales')
          .update({
            status: 'publish_failed',
            failure_reasons: nextReasons,
          })
          .eq('id', row.id)
          .neq('status', 'published')
      }
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

function hasPastEndDate(dateEnd: string | null): boolean {
  if (!dateEnd) return false
  const today = utcTodayDateString()
  return dateEnd < today
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

function saleRowImageFieldsEmpty(row: {
  cover_image_url: string | null
  images: unknown
}): boolean {
  const coverEmpty =
    row.cover_image_url == null || String(row.cover_image_url).trim() === ''
  const imgs = row.images
  const imagesEmpty = imgs == null || (Array.isArray(imgs) && imgs.length === 0)
  return coverEmpty && imagesEmpty
}

function normalizeTextOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const out = value.trim()
  return out.length > 0 ? out : null
}

function isLogoLikeImageUrl(value: string): boolean {
  const lower = value.toLowerCase()
  return (
    lower.includes('logo') ||
    lower.includes('site_logo') ||
    lower.includes('ystm_site') ||
    lower.includes('icon') ||
    lower.includes('sprite') ||
    lower.includes('favicon') ||
    lower.includes('banner') ||
    lower.includes('avatar') ||
    lower.includes('tracking') ||
    lower.includes('pixel') ||
    lower.includes('placeholder') ||
    lower.includes('default') ||
    lower.includes('blank') ||
    lower.includes('spacer')
  )
}

function existingSaleImagesReplaceable(row: {
  cover_image_url: string | null
  images: unknown
}): boolean {
  if (saleRowImageFieldsEmpty(row)) return true
  const cover = normalizeTextOrNull(row.cover_image_url)
  if (!cover) return true
  if (isLogoLikeImageUrl(cover)) return true
  return false
}

function normalizeImageArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function looksGenericTitle(value: string | null | undefined, city: string | null): boolean {
  const t = normalizeTextOrNull(value)
  if (!t) return true
  if (/^yard sale$/i.test(t) || /^garage sale$/i.test(t) || /^estate sale$/i.test(t)) return true
  if (/^listing$/i.test(t)) return true
  const cityNorm = normalizeTextOrNull(city)
  if (cityNorm && t.toLowerCase() === `${cityNorm.toLowerCase()} yard sale`) return true
  return false
}

function looksGenericDescription(value: string | null | undefined): boolean {
  const t = normalizeTextOrNull(value)
  if (!t) return true
  return /^yard sale\b/i.test(t) || /^garage sale\b/i.test(t) || /^estate sale\b/i.test(t) || /^listing\b/i.test(t)
}

function looksPollutedDescription(value: string | null | undefined): boolean {
  const t = normalizeTextOrNull(value)
  if (!t) return false
  const lower = t.toLowerCase()
  if (lower.includes('street view')) return true
  if (lower.includes('directions')) return true
  if (lower.includes('source:')) return true
  if (lower.includes('for more information')) return true
  if (lower.includes('please visit us at')) return true
  if (lower.includes('click here')) return true
  if (lower.includes('see listing')) return true
  if (/(garagesalefinder\.com|yardsaletreasuremap\.com|craigslist\.org|estatesales\.net)/i.test(lower)) return true
  if (/\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\.?\s+\d{1,2}\/\d{1,2}/i.test(lower)) return true
  if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]\s*\d{1,2}\/\d{1,2}/i.test(lower)) return true
  if (/\bstart(?:s)?\s*time\s*:\s*\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(lower)) return true
  if (/\bstarts?\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(lower)) return true
  if (/\b\d{5}(?:-\d{4})?\s*,?\s*usa\b/i.test(lower)) return true
  if (/\b\d{3,6}\s+[a-z0-9.\-'\s]+,\s*[a-z.\-\s]+,\s*[a-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\b/i.test(lower)) return true
  return false
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function addressAlreadyContainsCityState(address: string, city: string, state: string): boolean {
  const cityNorm = city.replace(/\s+/g, ' ').trim()
  const stateNorm = state.replace(/\s+/g, ' ').trim()
  if (!cityNorm || !stateNorm) return false

  const cityEsc = escapeRegExp(cityNorm)
  const optionalZip = '(?:\\s+\\d{5}(?:-\\d{4})?)?'
  const statePatterns = [escapeRegExp(stateNorm)]
  if (stateNorm.length === 2) {
    const full = uspsCodeToFullNameForAddress(stateNorm)
    if (full) statePatterns.push(escapeRegExp(full))
  }

  for (const stateEsc of statePatterns) {
    if (new RegExp(`${cityEsc}\\s*,\\s*${stateEsc}${optionalZip}`, 'i').test(address)) {
      return true
    }
  }
  return false
}

function normalizeAddressForPublishLocal(
  normalizedAddress: string | null,
  city: string,
  state: string
): string | null {
  const base = (normalizedAddress || '').replace(/\s+/g, ' ').trim()
  if (!base) return null
  const cityState = [city, state].map((v) => v.trim()).filter(Boolean).join(', ')
  if (!cityState) return base
  const suffixPattern = new RegExp(`(?:,\\s*${escapeRegExp(cityState)})+$`, 'i')
  const withoutDuplicateSuffix = base.replace(suffixPattern, '').replace(/\s*,\s*$/g, '').trim()
  if (!withoutDuplicateSuffix) return cityState
  if (addressAlreadyContainsCityState(withoutDuplicateSuffix, city, state)) {
    return withoutDuplicateSuffix
  }
  return `${withoutDuplicateSuffix}, ${cityState}`
}

function normalizeAddressForPublishSafe(
  normalizedAddress: string | null,
  city: string,
  state: string
): string | null {
  return normalizeAddressForPublishLocal(normalizedAddress, city, state)
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
      max: 3,
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
  const normalizedTimeStart = normalizeTextOrNull(record.time_start) || '09:00:00'
  const normalizedTimeEnd = normalizeTextOrNull(record.time_end)
  const bestEffortPatch: Record<string, unknown> = {}
  if (normalizedAddress && city && state) {
    try {
      validateResolvedAddressForPublish(normalizedAddress, city, state)
      bestEffortPatch.address = normalizedAddress
    } catch {
      /* omit low-quality ingest addresses from best-effort sale sync */
    }
  }
  if (normalizedDateStart) bestEffortPatch.date_start = normalizedDateStart
  bestEffortPatch.date_end = normalizedDateEnd
  bestEffortPatch.time_start = normalizedTimeStart
  bestEffortPatch.time_end = normalizedTimeEnd
  if (sanitizedImages.length > 0) {
    bestEffortPatch.cover_image_url = sanitizedImages[0]
    bestEffortPatch.images = sanitizedImages
  }

  const attemptBestEffortSync = async (reason: string): Promise<void> => {
    try {
      if (Object.keys(bestEffortPatch).length === 0) return
      const admin = getAdminDb()
      const { error: fallbackErr } = await fromBase(admin, 'sales')
        .update(bestEffortPatch)
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
      .select('ingested_sale_id, title, description, address, city, state, date_start, date_end, time_start, time_end, cover_image_url, images')
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
    } | null
    if (!row) {
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
    const normalizedDescription = normalizeTextOrNull(record.description)

    const patch: Record<string, unknown> = { ...bestEffortPatch }
    const saleCity = normalizeTextOrNull(row.city) || city
    const saleState = normalizeTextOrNull(row.state) || state
    const existingAddressNormalized =
      saleCity && saleState
        ? normalizeAddressForPublishSafe(row.address, saleCity, saleState)
        : normalizeTextOrNull(row.address)
    if (existingAddressNormalized && existingAddressNormalized !== normalizeTextOrNull(row.address)) {
      patch.address = existingAddressNormalized
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
      const existingImages = normalizeImageArray(row.images)
      const shouldReplaceMedia = existingSaleImagesReplaceable(row)
      const shouldExpandMedia = !shouldReplaceMedia && sanitizedImages.length > existingImages.length
      if (shouldReplaceMedia || shouldExpandMedia) {
        patch.images = sanitizedImages
        const existingCover = normalizeTextOrNull(row.cover_image_url)
        if (existingCover && sanitizedImages.includes(existingCover)) {
          patch.cover_image_url = existingCover
        } else {
          patch.cover_image_url = sanitizedImages[0]
        }
      } else {
        delete patch.cover_image_url
        delete patch.images
      }
    }

    if (Object.keys(patch).length === 0) {
      return
    }

    const { error: upErr } = await fromBase(admin, 'sales')
      .update(patch)
      .eq('id', saleId)

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

function claimedRowToPublishable(record: ClaimedPublishRow): PublishableIngestedSale {
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
    date_start: record.date_start,
    date_end: record.date_end,
    time_start: record.time_start,
    time_end: record.time_end,
    image_cloudinary_url: record.image_cloudinary_url,
    image_urls: [],
  }
}

function extractRawPayloadImageCandidates(rawPayload: unknown): string[] {
  if (!rawPayload || typeof rawPayload !== 'object') return []
  const imageUrls = (rawPayload as { imageUrls?: unknown }).imageUrls
  if (!Array.isArray(imageUrls)) return []
  return imageUrls.filter((value): value is string => typeof value === 'string')
}

/** Image URLs for publish: `raw_payload.imageUrls` first, then `image_source_url`, deduped in order. */
export function extractPublishImageCandidates(
  rawPayload: unknown,
  imageSourceUrl: string | null | undefined
): string[] {
  const fromPayload = extractRawPayloadImageCandidates(rawPayload)
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of fromPayload) {
    const t = u.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  if (typeof imageSourceUrl === 'string') {
    const t = imageSourceUrl.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

/** Insert sale or, on unique conflict for `ingested_sale_id`, reuse the existing row. */
async function tryCreatePublishedSaleOrReuseExisting(record: ClaimedPublishRow): Promise<string> {
  const body = claimedRowToPublishable(record)
  const sanitizedImages = await sanitizePublishImagesForRecord(record)
  if (sanitizedImages.length > 0) {
    body.image_urls = sanitizedImages
  }

  const patchCtx = { rowId: record.id, city: record.city, state: record.state }
  let saleId: string
  try {
    const created = await createPublishedSale(body)
    saleId = created.saleId
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
  return saleId
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
  const admin = getAdminDb()
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

  let upErr: { message: string } | null = null
  try {
    const result = await fromBase(admin, 'ingested_sales')
      .update(payload)
      .eq('id', rowId)
      .eq('status', 'publishing')
    upErr = result?.error ?? null
  } catch (error) {
    logger.error(
      'markIngestedPublishFailedFromSaleCreateError guarded update threw; trying fallback',
      error instanceof Error ? error : new Error(String(error)),
      { component: 'ingestion/publishWorker', operation, rowId, phase: 'create_sale' }
    )
    upErr = { message: error instanceof Error ? error.message : String(error) }
  }

  if (upErr) {
    const { error: fallbackError } = await fromBase(admin, 'ingested_sales').update(payload).eq('id', rowId)
    if (!fallbackError) {
      logger.error(
        '[CRITICAL] markIngestedPublishFailedFromSaleCreateError used unguarded fallback to clear publishing',
        new Error(message),
        { component: 'ingestion/publishWorker', operation, rowId, phase: 'create_sale', critical: true, usedFallbackWithoutStatusGuard: true }
      )
      return
    }
    logger.error(
      'Failed to persist publish_failed after createPublishedSale error',
      new Error(fallbackError.message),
      { component: 'ingestion/publishWorker', operation, rowId, phase: 'create_sale' }
    )
  }
}

async function markIngestedPublishFailedValidation(
  rowId: string,
  existingFailureReasons: unknown,
  operation: string,
  city: string | null,
  state: string | null,
  dateEnd: string
): Promise<void> {
  const admin = getAdminDb()
  const message = `terminal validation failure: date_end ${dateEnd} is before ${utcTodayDateString()}`
  const mergedReasons = appendFailureReason(toFailureReasons(existingFailureReasons), 'publish_error')
  const payload = {
    status: 'publish_failed' as const,
    failure_reasons: mergedReasons,
    failure_details: buildPublishFailureDetails(message, {
      phase: 'validation',
      operation,
      reason: 'past_end_date',
      originalDateEnd: dateEnd,
      city,
      state,
    }),
  }

  logPublishFailureStructured({
    rowId,
    message,
    phase: 'validation',
    operation,
    city,
    state,
    reason: 'past_end_date',
    dateEnd,
  })

  const { error: upErr } = await fromBase(admin, 'ingested_sales')
    .update(payload)
    .eq('id', rowId)
    .eq('status', 'publishing')

  if (!upErr) {
    return
  }

  logger.error(
    'markIngestedPublishFailedValidation guarded update failed; triggering fallback',
    new Error(upErr.message),
    { component: 'ingestion/publishWorker', operation, rowId, phase: 'validation', reason: 'past_end_date' }
  )

  const { error: fallbackError } = await fromBase(admin, 'ingested_sales').update(payload).eq('id', rowId)

  if (fallbackError) {
    logger.error(
      '[CRITICAL] markIngestedPublishFailedValidation fallback update failed — ingested row may still be non-terminal',
      new Error(fallbackError.message),
      { component: 'ingestion/publishWorker', operation, rowId, phase: 'validation', reason: 'past_end_date', critical: true }
    )
    return
  }

  logger.error(
    '[CRITICAL] markIngestedPublishFailedValidation used unguarded fallback to clear publishing',
    new Error(message),
    { component: 'ingestion/publishWorker', operation, rowId, phase: 'validation', reason: 'past_end_date', critical: true, usedFallbackWithoutStatusGuard: true }
  )
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
  const admin = getAdminDb()
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
        'markIngestedPublishFailedFromPublishing guarded update threw',
        thrown instanceof Error ? thrown : new Error(String(thrown)),
        { component: 'ingestion/publishWorker', operation, rowId, attempt: attempt + 1 }
      )
    }
    if (!error) {
      return
    }
    if (attempt === 1) {
      logger.error(
        'markIngestedPublishFailedFromPublishing guarded update failed after 2 attempts',
        new Error(error.message),
        { component: 'ingestion/publishWorker', operation, rowId }
      )
    } else {
      logger.error(
        'markIngestedPublishFailedFromPublishing guarded update failed (will retry)',
        new Error(error.message),
        { component: 'ingestion/publishWorker', operation, rowId, attempt: attempt + 1 }
      )
    }
  }

  const { error: fallbackError } = await fromBase(admin, 'ingested_sales').update(payload).eq('id', rowId)

  if (fallbackError) {
    logger.error(
      '[CRITICAL] markIngestedPublishFailedFromPublishing fallback update failed — ingested row may still be non-terminal',
      new Error(fallbackError.message),
      { component: 'ingestion/publishWorker', operation, rowId, critical: true }
    )
    return
  }

  logger.error(
    '[CRITICAL] markIngestedPublishFailedFromPublishing used unguarded fallback to clear publishing',
    new Error(errorMessage),
    { component: 'ingestion/publishWorker', operation, rowId, critical: true, usedFallbackWithoutStatusGuard: true }
  )
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
      'id, source_platform, source_url, title, description, normalized_address, city, state, zip_code, lat, lng, date_start, date_end, time_start, time_end, image_cloudinary_url, image_source_url, raw_payload, published_sale_id, failure_reasons'
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

  const claimed = row as unknown as ClaimedPublishRow
  if (hasPastEndDate(claimed.date_end)) {
    await markIngestedPublishFailedValidation(
      claimed.id,
      claimed.failure_reasons,
      'validate_end_date_single',
      claimed.city,
      claimed.state,
      claimed.date_end as string
    )
    return { ok: false, error: `publish blocked: past end date (${claimed.date_end})` }
  }

  let createdSaleId: string | null = null

  try {
    const sanitizedImages = await sanitizePublishImagesForRecord(claimed)
    const linkedSaleId = await linkedSaleIdForRow(claimed)
    const saleId = linkedSaleId ?? (await tryCreatePublishedSaleOrReuseExisting(claimed))
    createdSaleId = saleId
    if (linkedSaleId) {
      await maybeSyncExistingSaleFromLatestIngest(saleId, claimed, sanitizedImages, {
        rowId: claimed.id,
        city: claimed.city,
        state: claimed.state,
      })
    }

    const updatePayload = {
      status: 'published' as const,
      published_sale_id: saleId,
      published_at: new Date().toISOString(),
    }
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

    logger.info('publishReadyIngestedSaleById completed', {
      component: 'ingestion/publishWorker',
      operation: 'single_complete',
      rowId: claimed.id,
      saleId,
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
      'create_sale_single',
      claimed.city,
      claimed.state
    )

    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function publishReadyIngestedSales(): Promise<PublishWorkerBatchSummary> {
  const admin = getAdminDb()
  const batchSize = parseBatchSize()

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

  const claimedRows = await hydrateClaimedRowsRawPayload((Array.isArray(data) ? data : []) as ClaimedPublishRow[])
  const summary: PublishWorkerBatchSummary = {
    attempted: claimedRows.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  }

  for (const row of claimedRows) {
    if (hasPastEndDate(row.date_end)) {
      await markIngestedPublishFailedValidation(
        row.id,
        row.failure_reasons,
        'validate_end_date_batch',
        row.city,
        row.state,
        row.date_end as string
      )
      summary.failed += 1
      continue
    }

    let createdSaleId: string | null = null
    try {
      const sanitizedImages = await sanitizePublishImagesForRecord(row)
      const linkedSaleId = await linkedSaleIdForRow(row)
      const saleId = linkedSaleId ?? (await tryCreatePublishedSaleOrReuseExisting(row))
      createdSaleId = saleId
      if (linkedSaleId) {
        await maybeSyncExistingSaleFromLatestIngest(saleId, row, sanitizedImages, {
          rowId: row.id,
          city: row.city,
          state: row.state,
        })
      }

      const updatePayload = {
        status: 'published',
        published_sale_id: saleId,
        published_at: new Date().toISOString(),
      }
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

      summary.succeeded += 1
      logger.info('Publish worker row processed', {
        component: 'ingestion/publishWorker',
        operation: 'row_result',
        rowId: row.id,
        result: 'success',
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
        'create_sale_batch',
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
  })

  return summary
}

