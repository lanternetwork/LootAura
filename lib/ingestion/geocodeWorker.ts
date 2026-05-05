import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { geocodeAddress } from '@/lib/geocode/geocodeAddress'
import { logger } from '@/lib/log'
import { publishReadyIngestedSaleById, type PublishReadyByIdResult } from '@/lib/ingestion/publishWorker'
import type { FailureReason } from '@/lib/ingestion/types'

interface ClaimedGeocodeRow {
  id: string
  normalized_address: string | null
  address_raw: string | null
  city: string | null
  state: string | null
  geocode_attempts: number
  failure_reasons: unknown
}

export interface GeocodeWorkerSummary {
  claimed: number
  succeeded: number
  failedRetriable: number
  failedTerminal: number
  rate429Count: number
}

export type GeocodeIngestedSaleByIdResult =
  | { outcome: 'skipped'; reason: 'not_found' | 'not_needs_geocode' | 'concurrent_status_change' }
  | { outcome: 'success'; published?: boolean; publishedSaleId?: string }
  | { outcome: 'geocode_failed'; retriable: boolean }
  | { outcome: 'publish_failed'; error: string }

function parseBatchSize(): number {
  const raw = process.env.GEOCODE_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : 100
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100
  }
  return Math.min(parsed, 500)
}

/** Bounded parallelism for processGeocodeAttempt only; capped at 3 per rollout guidance. */
function parseGeocodeConcurrency(): number {
  const raw = process.env.GEOCODE_CONCURRENCY
  const defaultConcurrency = 2
  if (raw === undefined || raw === '') {
    return defaultConcurrency
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultConcurrency
  }
  return Math.min(parsed, 3)
}

function toFailureReasons(value: unknown): FailureReason[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is FailureReason => typeof item === 'string')
}

function appendFailureReason(reasons: FailureReason[], reason: FailureReason): FailureReason[] {
  if (reasons.includes(reason)) {
    return reasons
  }
  return [...reasons, reason]
}

function streetLineForGeocode(row: ClaimedGeocodeRow): string {
  const normalized = row.normalized_address?.trim() || ''
  if (normalized) {
    return normalized
  }
  return row.address_raw?.trim() || ''
}

async function markGeocodeTerminalNeedsCheck(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  failureReasons: unknown,
  reason: FailureReason
): Promise<boolean> {
  const existingReasons = toFailureReasons(failureReasons)
  const mergedReasons = appendFailureReason(existingReasons, reason)
  const { error: terminalError } = await fromBase(admin, 'ingested_sales')
    .update({
      status: 'needs_check',
      failure_reasons: mergedReasons,
    })
    .eq('id', rowId)
  if (terminalError) {
    logger.error(
      'Failed to mark row as needs_check after geocode retries',
      new Error(terminalError.message),
      {
        component: 'ingestion/geocodeWorker',
        operation: 'mark_needs_check',
        rowId,
      }
    )
    return false
  }
  return true
}

function mapPublishResultToByIdOutcome(publish: PublishReadyByIdResult): GeocodeIngestedSaleByIdResult {
  if (publish.ok && 'publishedSaleId' in publish) {
    return { outcome: 'success', published: true, publishedSaleId: publish.publishedSaleId }
  }
  if (publish.ok && 'skipped' in publish && publish.skipped) {
    return { outcome: 'success', published: false }
  }
  return { outcome: 'publish_failed', error: 'error' in publish ? publish.error : 'publish failed' }
}

async function applyGeocodeSuccess(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  lat: number,
  lng: number
): Promise<{ kind: 'geocoded'; publish: PublishReadyByIdResult } | { kind: 'update_failed' }> {
  const { data: updated, error: updateError } = await fromBase(admin, 'ingested_sales')
    .update({ lat, lng, status: 'ready' })
    .eq('id', rowId)
    .eq('status', 'needs_geocode')
    .select('id')
    .maybeSingle()

  if (updateError) {
    logger.error('Failed to update geocoded row', new Error(updateError.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'mark_ready',
      rowId,
    })
    return { kind: 'update_failed' }
  }

  const publishResult = await publishReadyIngestedSaleById(rowId)

  if (!updated) {
    logger.info('Geocode update skipped (concurrent transition); publish attempted', {
      component: 'ingestion/geocodeWorker',
      operation: 'apply_geocode_success',
      rowId,
    })
  }

  return { kind: 'geocoded', publish: publishResult }
}

type AttemptResult =
  | { kind: 'geocode_ok'; publish: PublishReadyByIdResult; hit429: false }
  | { kind: 'geocode_fail'; retriable: boolean; terminal: boolean; hit429: boolean }

/**
 * Process items with at most `concurrency` in-flight tasks (pool / work-queue model).
 * Per-item failures are contained by the processor; unexpected throws are caught here.
 */
async function runClaimedRowsWithConcurrency(
  claimedRows: ClaimedGeocodeRow[],
  concurrency: number,
  processRow: (row: ClaimedGeocodeRow) => Promise<AttemptResult>
): Promise<AttemptResult[]> {
  const results: AttemptResult[] = new Array(claimedRows.length)
  if (claimedRows.length === 0) {
    return results
  }

  const limit = Math.max(1, Math.min(concurrency, claimedRows.length))
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const i = nextIndex++
      if (i >= claimedRows.length) {
        return
      }
      const row = claimedRows[i]
      try {
        results[i] = await processRow(row)
      } catch (error) {
        logger.error(
          'Geocode worker unexpected error processing row',
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'ingestion/geocodeWorker',
            operation: 'row_unexpected_error',
            rowId: row.id,
          }
        )
        results[i] = { kind: 'geocode_fail', retriable: true, terminal: false, hit429: false }
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

/**
 * Shared processor for a row whose `geocode_attempts` has already been incremented (RPC claim or by-id path).
 */
async function processGeocodeAttempt(row: ClaimedGeocodeRow): Promise<AttemptResult> {
  const admin = getAdminDb()
  const rowId = row.id
  const attemptCount = row.geocode_attempts
  const address = streetLineForGeocode(row)
  const city = row.city?.trim() || ''
  const state = row.state?.trim() || ''

  if (address && city && state) {
    const geo = await geocodeAddress({ address, city, state })
    if (geo.coords) {
      const outcome = await applyGeocodeSuccess(admin, rowId, geo.coords.lat, geo.coords.lng)
      if (outcome.kind === 'update_failed') {
        logger.warn('Geocode worker row processed', {
          component: 'ingestion/geocodeWorker',
          operation: 'row_result',
          rowId,
          attemptCount,
          result: 'update_failed_after_geocode',
        })
        return { kind: 'geocode_fail', retriable: true, terminal: false, hit429: false }
      }

      logger.info('Geocode worker row processed', {
        component: 'ingestion/geocodeWorker',
        operation: 'row_result',
        rowId,
        attemptCount,
        result: 'geocode_ok',
      })

      return { kind: 'geocode_ok', publish: outcome.publish, hit429: false }
    }
    const hit429 = geo.hit429
    if (attemptCount >= 3) {
      const ok = await markGeocodeTerminalNeedsCheck(admin, rowId, row.failure_reasons, 'geocode_failed')
      if (ok) {
        logger.warn('Geocode worker row processed', {
          component: 'ingestion/geocodeWorker',
          operation: 'row_result',
          rowId,
          attemptCount,
          result: 'failed_terminal',
        })
        return { kind: 'geocode_fail', retriable: false, terminal: true, hit429 }
      }
      return { kind: 'geocode_fail', retriable: true, terminal: false, hit429 }
    }

    logger.warn('Geocode worker row processed', {
      component: 'ingestion/geocodeWorker',
      operation: 'row_result',
      rowId,
      attemptCount,
      result: 'failed_retriable',
    })
    return { kind: 'geocode_fail', retriable: true, terminal: false, hit429 }
  }

  if (attemptCount >= 3) {
    const ok = await markGeocodeTerminalNeedsCheck(admin, rowId, row.failure_reasons, 'geocode_failed')
    if (ok) {
      logger.warn('Geocode worker row processed', {
        component: 'ingestion/geocodeWorker',
        operation: 'row_result',
        rowId,
        attemptCount,
        result: 'failed_terminal',
      })
      return { kind: 'geocode_fail', retriable: false, terminal: true, hit429: false }
    }
    return { kind: 'geocode_fail', retriable: true, terminal: false, hit429: false }
  }

  logger.warn('Geocode worker row processed', {
    component: 'ingestion/geocodeWorker',
    operation: 'row_result',
    rowId,
    attemptCount,
    result: 'failed_retriable',
  })
  return { kind: 'geocode_fail', retriable: true, terminal: false, hit429: false }
}

/**
 * Idempotent single-row geocode + lifecycle transition + publish trigger (spec §6, §11).
 * Safe to call multiple times; no-ops when status is no longer `needs_geocode`.
 */
export async function geocodeIngestedSaleById(saleId: string): Promise<GeocodeIngestedSaleByIdResult> {
  const admin = getAdminDb()

  const { data: row, error: fetchError } = await fromBase(admin, 'ingested_sales')
    .select(
      'id, status, normalized_address, address_raw, city, state, lat, lng, geocode_attempts, failure_reasons, published_sale_id'
    )
    .eq('id', saleId)
    .maybeSingle()

  if (fetchError || !row) {
    if (fetchError) {
      logger.error('geocodeIngestedSaleById fetch failed', new Error(fetchError.message), {
        component: 'ingestion/geocodeWorker',
        operation: 'fetch_row',
        saleId,
      })
    }
    return { outcome: 'skipped', reason: 'not_found' }
  }

  const r = row as {
    id: string
    status: string
    normalized_address: string | null
    address_raw: string | null
    city: string | null
    state: string | null
    lat: unknown
    lng: unknown
    geocode_attempts: number
    failure_reasons: unknown
    published_sale_id: string | null
  }

  if (r.status !== 'needs_geocode') {
    return { outcome: 'skipped', reason: 'not_needs_geocode' }
  }

  const latN = r.lat != null ? Number(r.lat) : NaN
  const lngN = r.lng != null ? Number(r.lng) : NaN
  if (Number.isFinite(latN) && Number.isFinite(lngN)) {
    const { error: readyError } = await fromBase(admin, 'ingested_sales')
      .update({ status: 'ready' })
      .eq('id', r.id)
      .eq('status', 'needs_geocode')

    if (readyError) {
      logger.error('geocodeIngestedSaleById failed to mark ready (pre-existing coords)', new Error(readyError.message), {
        component: 'ingestion/geocodeWorker',
        operation: 'mark_ready_stuck_coords',
        saleId: r.id,
      })
      return { outcome: 'geocode_failed', retriable: true }
    }

    return mapPublishResultToByIdOutcome(await publishReadyIngestedSaleById(r.id))
  }

  const nextAttempts = (r.geocode_attempts ?? 0) + 1
  const { data: bumped, error: bumpError } = await fromBase(admin, 'ingested_sales')
    .update({
      geocode_attempts: nextAttempts,
      last_geocode_attempt_at: new Date().toISOString(),
    })
    .eq('id', saleId)
    .eq('status', 'needs_geocode')
    .select('id')
    .maybeSingle()

  if (bumpError) {
    logger.error('geocodeIngestedSaleById attempt bump failed', new Error(bumpError.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'bump_attempts',
      saleId,
    })
    return { outcome: 'geocode_failed', retriable: true }
  }

  if (!bumped) {
    return { outcome: 'skipped', reason: 'concurrent_status_change' }
  }

  const attemptRow: ClaimedGeocodeRow = {
    id: r.id,
    normalized_address: r.normalized_address,
    address_raw: r.address_raw ?? null,
    city: r.city,
    state: r.state,
    geocode_attempts: nextAttempts,
    failure_reasons: r.failure_reasons,
  }

  const attempt = await processGeocodeAttempt(attemptRow)
  if (attempt.kind === 'geocode_ok') {
    return mapPublishResultToByIdOutcome(attempt.publish)
  }
  return { outcome: 'geocode_failed', retriable: attempt.retriable }
}

export async function geocodePendingSales(): Promise<GeocodeWorkerSummary> {
  const admin = getAdminDb()
  const batchSize = parseBatchSize()
  const cooldownMinutes = 15

  const { data, error } = await (admin as any).rpc('claim_ingested_sales_for_geocoding', {
    p_batch_size: batchSize,
    p_cooldown_minutes: cooldownMinutes,
  })

  if (error) {
    logger.error('Failed to claim rows for geocoding worker', new Error(error.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'claim_rows',
      batchSize,
    })
    throw error
  }

  const claimedRows = (Array.isArray(data) ? data : []) as ClaimedGeocodeRow[]
  const concurrency = parseGeocodeConcurrency()
  const summary: GeocodeWorkerSummary = {
    claimed: claimedRows.length,
    succeeded: 0,
    failedRetriable: 0,
    failedTerminal: 0,
    rate429Count: 0,
  }

  const batchStarted = Date.now()
  const rowResults = await runClaimedRowsWithConcurrency(
    claimedRows,
    concurrency,
    processGeocodeAttempt
  )

  for (const rowResult of rowResults) {
    if (rowResult.kind === 'geocode_fail' && rowResult.hit429) {
      summary.rate429Count += 1
    }
    if (rowResult.kind === 'geocode_ok') {
      summary.succeeded += 1
    } else if (rowResult.terminal) {
      summary.failedTerminal += 1
    } else {
      summary.failedRetriable += 1
    }
  }

  const durationMs = Date.now() - batchStarted
  const failureCount = summary.failedRetriable + summary.failedTerminal

  logger.info('Geocode worker completed batch', {
    component: 'ingestion/geocodeWorker',
    operation: 'batch_complete',
    batchSize,
    claimed: summary.claimed,
    succeeded: summary.succeeded,
    failedRetriable: summary.failedRetriable,
    failedTerminal: summary.failedTerminal,
    rate429Count: summary.rate429Count,
    failureCount,
    durationMs,
    concurrency,
  })

  return summary
}
