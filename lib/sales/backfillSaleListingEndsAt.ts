import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { diagnoseSaleListingEnds } from '@/lib/sales/resolvePersistableSaleEndsAt'

export type AdminDbForBackfill = ReturnType<typeof getAdminDb>

export type BackfillSaleListingEndsMetrics = {
  processed: number
  /** Rows successfully persisted (0 when dry_run). */
  updated: number
  /** When dry_run, rows that would have been updated. */
  dry_run_planned_updates: number
  skipped: number
  invalid_timezone: number
  compute_failures: number
  batches: number
  dry_run: boolean
  last_processed_id: string | null
}

export type RunBackfillSaleListingEndsOptions = {
  admin?: AdminDbForBackfill
  batchSize?: number
  dryRun?: boolean
  /** Stop after this many rows examined (across batches). */
  maxRows?: number
  resumeAfterId?: string | null
  logOperation?: string
}

type SaleRow = {
  id: string
  date_start: string
  time_start: string | null
  date_end: string | null
  time_end: string | null
  zip_code: string | null
  state: string | null
  lat: number | string
  lng: number | string
  ends_at: string | null
  listing_timezone: string | null
}

function toNum(v: number | string): number {
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

function normTz(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

function samePersisted(
  row: SaleRow,
  next: { ends_at: string | null; listing_timezone: string | null }
): boolean {
  const a = row.ends_at ?? null
  const b = next.ends_at ?? null
  const tzA = normTz(row.listing_timezone)
  const tzB = normTz(next.listing_timezone)
  return a === b && tzA === tzB
}

/**
 * Batched backfill for `ends_at` + `listing_timezone` using `diagnoseSaleListingEnds` only (no SQL TZ logic).
 * Idempotent: rows already matching diagnosis are skipped. Supports dry-run (no writes).
 */
export async function runBackfillSaleListingEnds(
  options: RunBackfillSaleListingEndsOptions = {}
): Promise<BackfillSaleListingEndsMetrics> {
  const admin = options.admin ?? getAdminDb()
  const batchSize = Math.min(Math.max(options.batchSize ?? 75, 1), 500)
  const dryRun = options.dryRun === true
  const maxRows = options.maxRows != null && options.maxRows > 0 ? options.maxRows : Number.POSITIVE_INFINITY
  const logOp = options.logOperation ?? 'backfill_sale_listing_ends'

  const metrics: BackfillSaleListingEndsMetrics = {
    processed: 0,
    updated: 0,
    dry_run_planned_updates: 0,
    skipped: 0,
    invalid_timezone: 0,
    compute_failures: 0,
    batches: 0,
    dry_run: dryRun,
    last_processed_id: null,
  }

  let resumeAfterId = options.resumeAfterId?.trim() ? options.resumeAfterId : null

  while (metrics.processed < maxRows) {
    const limit = Math.min(batchSize, maxRows - metrics.processed)
    if (limit <= 0) break

    let q = fromBase(admin, 'sales')
      .select(
        'id, date_start, time_start, date_end, time_end, zip_code, state, lat, lng, ends_at, listing_timezone'
      )
      .or('ends_at.is.null,listing_timezone.is.null')
      .order('id', { ascending: true })
      .limit(limit)

    if (resumeAfterId) {
      q = q.gt('id', resumeAfterId)
    }

    const { data: rows, error } = await q
    if (error) {
      logger.error(
        'sale_listing_ends_backfill: query failed',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'sales/backfill', operation: logOp }
      )
      throw new Error(error.message || 'backfill select failed')
    }

    const batch = (rows || []) as SaleRow[]
    metrics.batches += 1

    if (batch.length === 0) {
      break
    }

    for (const row of batch) {
      if (metrics.processed >= maxRows) break

      metrics.processed += 1
      metrics.last_processed_id = row.id

      const lat = toNum(row.lat)
      const lng = toNum(row.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        metrics.skipped += 1
        logger.warn('sale_listing_ends_backfill: skip row (invalid lat/lng)', {
          component: 'sales/backfill',
          operation: logOp,
          sale_id: row.id,
        })
        continue
      }

      const diagnosis = await diagnoseSaleListingEnds(admin, {
        date_start: String(row.date_start),
        time_start: row.time_start,
        date_end: row.date_end,
        time_end: row.time_end,
        zip_code: row.zip_code,
        state: row.state,
        lat,
        lng,
      })

      if (diagnosis.outcome === 'tz_unresolved') {
        metrics.skipped += 1
        logger.warn('sale_listing_ends_backfill: skip (timezone unresolved)', {
          component: 'sales/backfill',
          operation: logOp,
          sale_id: row.id,
          reason: diagnosis.reason,
        })
        continue
      }

      if (diagnosis.outcome === 'compute_failed') {
        if (diagnosis.computeReason === 'invalid_timezone') {
          metrics.invalid_timezone += 1
        } else {
          metrics.compute_failures += 1
        }
        metrics.skipped += 1
        logger.warn('sale_listing_ends_backfill: skip (compute failed)', {
          component: 'sales/backfill',
          operation: logOp,
          sale_id: row.id,
          compute_reason: diagnosis.computeReason,
          listing_timezone: diagnosis.listing_timezone,
        })
        continue
      }

      const next = { ends_at: diagnosis.ends_at, listing_timezone: diagnosis.listing_timezone }
      if (samePersisted(row, next)) {
        metrics.skipped += 1
        continue
      }

      if (dryRun) {
        metrics.dry_run_planned_updates += 1
        continue
      }

      const nowIso = new Date().toISOString()
      const { error: upErr } = await fromBase(admin, 'sales')
        .update({
          ends_at: next.ends_at,
          listing_timezone: next.listing_timezone,
          updated_at: nowIso,
        })
        .eq('id', row.id)

      if (upErr) {
        metrics.skipped += 1
        logger.warn('sale_listing_ends_backfill: update failed', {
          component: 'sales/backfill',
          operation: logOp,
          sale_id: row.id,
          message: upErr.message,
        })
        continue
      }

      metrics.updated += 1
    }

    resumeAfterId = batch[batch.length - 1]!.id

    logger.info('sale_listing_ends_backfill_batch', {
      component: 'sales/backfill',
      operation: logOp,
      dry_run: dryRun,
      batch_size: batch.length,
      cumulative_processed: metrics.processed,
      cumulative_updated: metrics.updated,
      dry_run_planned_updates: metrics.dry_run_planned_updates,
      cumulative_skipped: metrics.skipped,
      invalid_timezone: metrics.invalid_timezone,
      compute_failures: metrics.compute_failures,
      resume_after_id: resumeAfterId,
    })

    if (batch.length < limit) {
      break
    }
  }

  logger.info('sale_listing_ends_backfill_complete', {
    component: 'sales/backfill',
    operation: logOp,
    dry_run: dryRun,
    ...metrics,
  })

  return metrics
}
