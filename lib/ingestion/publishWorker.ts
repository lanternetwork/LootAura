import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { createPublishedSale, type PublishableIngestedSale } from '@/lib/ingestion/publish'
import { logger, type LogContext } from '@/lib/log'
import type { FailureReason } from '@/lib/ingestion/types'

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

function parseBatchSize(): number {
  const raw = process.env.INGEST_BATCH_SIZE
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

function claimedRowToPublishable(record: ClaimedPublishRow): PublishableIngestedSale {
  return {
    id: record.id,
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
  }
}

/** Insert sale or, on unique conflict for `ingested_sale_id`, reuse the existing row. */
async function tryCreatePublishedSaleOrReuseExisting(record: ClaimedPublishRow): Promise<string> {
  const body = claimedRowToPublishable(record)
  try {
    const { saleId } = await createPublishedSale(body)
    return saleId
  } catch (err) {
    if (!isIngestedSaleIdUniqueViolation(err)) throw err
    const existing = await fetchExistingSaleIdForIngested(record.id)
    if (!existing) throw err
    logger.info('publish idempotent: resolved existing sale for ingested row', {
      component: 'ingestion/publishWorker',
      operation: 'reuse_existing_sale',
      rowId: record.id,
      saleId: existing,
    })
    return existing
  }
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
  const mergedReasons = appendFailureReason(toFailureReasons(existingFailureReasons), 'publish_error')
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

  const { error: upErr } = await fromBase(admin, 'ingested_sales')
    .update(payload)
    .eq('id', rowId)
    .eq('status', 'publishing')

  if (upErr) {
    logger.error(
      'Failed to persist publish_failed after createPublishedSale error',
      new Error(upErr.message),
      { component: 'ingestion/publishWorker', operation, rowId, phase: 'create_sale' }
    )
    return
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
    const { error } = await fromBase(admin, 'ingested_sales')
      .update(payload)
      .eq('id', rowId)
      .eq('status', 'publishing')
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
    .is('published_sale_id', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .select(
      'id, source_platform, source_url, title, description, normalized_address, city, state, zip_code, lat, lng, date_start, date_end, time_start, time_end, image_cloudinary_url, failure_reasons'
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
    const saleId = await tryCreatePublishedSaleOrReuseExisting(claimed)
    createdSaleId = saleId

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

  const claimedRows = (Array.isArray(data) ? data : []) as ClaimedPublishRow[]
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
      const saleId = await tryCreatePublishedSaleOrReuseExisting(row)
      createdSaleId = saleId

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

