import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { geocodeAddress } from '@/lib/geocode/geocodeAddress'
import { logger } from '@/lib/log'
import type { FailureReason } from '@/lib/ingestion/types'
import { publishReadyIngestedSales } from '@/lib/ingestion/publishWorker'

export const MAX_GEOCODE_RETRIES = 5

export interface PublishAfterGeocodeParams {
  source: 'batch' | 'single'
  succeededCount: number
}

/**
 * Reuses publishReadyIngestedSales (RPC claim + worker). Safe to call multiple times per invocation window.
 */
export async function publishAfterGeocodeSuccess(params: PublishAfterGeocodeParams): Promise<void> {
  const { source, succeededCount } = params
  try {
    const summary = await publishReadyIngestedSales()
    logger.info('publish_triggered_after_geocode', {
      component: 'ingestion/geocodeWorker',
      operation: 'publish_after_geocode',
      source,
      succeeded_count: succeededCount,
      publish_claimed: summary.claimed,
      publish_published: summary.published,
      publish_failed: summary.failed,
    })
  } catch (error) {
    logger.warn('publish_triggered_after_geocode', {
      component: 'ingestion/geocodeWorker',
      operation: 'publish_after_geocode',
      source,
      succeeded_count: succeededCount,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

interface ClaimedGeocodeRow {
  id: string
  normalized_address: string | null
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
}

export interface GeocodeRowResult {
  success: boolean
  terminalFailure: boolean
  attemptCount: number
}

function parseBatchSize(): number {
  const raw = process.env.GEOCODE_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : 100
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100
  }
  return Math.min(parsed, 500)
}

function toFailureReasons(value: unknown): FailureReason[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is FailureReason => typeof item === 'string')
}

function appendFailureReason(reasons: FailureReason[], reason: FailureReason): FailureReason[] {
  if (reasons.includes(reason)) {
    return reasons
  }
  return [...reasons, reason]
}

async function processClaimedRow(
  admin: ReturnType<typeof getAdminDb>,
  row: ClaimedGeocodeRow
): Promise<GeocodeRowResult> {
  const rowId = row.id
  const attemptCount = row.geocode_attempts
  const address = row.normalized_address?.trim() || ''
  const city = row.city?.trim() || ''
  const state = row.state?.trim() || ''

  let success = false
  if (address && city && state) {
    const result = await geocodeAddress({ address, city, state })
    if (result) {
      const { error: updateError } = await fromBase(admin, 'ingested_sales')
        .update({
          lat: result.lat,
          lng: result.lng,
          status: 'ready',
        })
        .eq('id', rowId)
        .eq('status', 'needs_geocode')
      if (!updateError) {
        success = true
      } else {
        logger.error('Failed to update geocoded row', new Error(updateError.message), {
          component: 'ingestion/geocodeWorker',
          operation: 'mark_ready',
          rowId,
          attemptCount,
        })
      }
    }
  }

  if (success) {
    logger.info('Geocode worker row processed', {
      component: 'ingestion/geocodeWorker',
      operation: 'row_result',
      rowId,
      attemptCount,
      result: 'success',
    })
    return { success: true, terminalFailure: false, attemptCount }
  }

  if (attemptCount >= MAX_GEOCODE_RETRIES) {
    const existingReasons = toFailureReasons(row.failure_reasons)
    const mergedReasons = appendFailureReason(existingReasons, 'geocode_failed')
    const { error: terminalError } = await fromBase(admin, 'ingested_sales')
      .update({
        status: 'needs_check',
        failure_reasons: mergedReasons,
      })
      .eq('id', rowId)
      .eq('status', 'needs_geocode')
    if (terminalError) {
      logger.error('Failed to mark row as needs_check after geocode retries', new Error(terminalError.message), {
        component: 'ingestion/geocodeWorker',
        operation: 'mark_needs_check',
        rowId,
        attemptCount,
      })
    }
    logger.warn('Geocode worker row processed', {
      component: 'ingestion/geocodeWorker',
      operation: 'row_result',
      rowId,
      attemptCount,
      result: 'failed_terminal',
    })
    logger.warn('geocode terminal failure', {
      component: 'ingestion/geocodeWorker',
      operation: 'terminal_failure',
      rowId,
      attemptCount,
    })
    return { success: false, terminalFailure: true, attemptCount }
  }

  logger.warn('Geocode worker row processed', {
    component: 'ingestion/geocodeWorker',
    operation: 'row_result',
    rowId,
    attemptCount,
    result: 'failed_retriable',
  })
  return { success: false, terminalFailure: false, attemptCount }
}

export interface GeocodeIngestedSaleByIdOptions {
  /** When true, caller invokes publish once per queue batch (avoids N publish calls). */
  skipPublishAfterSuccess?: boolean
}

export async function geocodeIngestedSaleById(
  rowId: string,
  options?: GeocodeIngestedSaleByIdOptions
): Promise<GeocodeRowResult | null> {
  const admin = getAdminDb()
  const cooldownMinutes = 15
  const nowIso = new Date().toISOString()
  const cutoffIso = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString()

  const { data: current, error: readError } = await fromBase(admin, 'ingested_sales')
    .select('id, normalized_address, city, state, geocode_attempts, failure_reasons, status, last_geocode_attempt_at, lat, lng')
    .eq('id', rowId)
    .maybeSingle()

  if (readError) {
    logger.error('Failed to load row for queued geocode', new Error(readError.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'load_row_by_id',
      rowId,
    })
    return null
  }

  if (!current) {
    return null
  }

  if (current.status === 'ready' || current.lat != null || current.lng != null) {
    logger.info('geocode skipped (already processed)', {
      component: 'ingestion/geocodeWorker',
      operation: 'skip_already_processed',
      rowId,
      status: current.status,
      hasLat: current.lat != null,
      hasLng: current.lng != null,
    })
    return null
  }

  if (current.status !== 'needs_geocode' || Number(current.geocode_attempts || 0) >= MAX_GEOCODE_RETRIES) {
    if (Number(current.geocode_attempts || 0) >= MAX_GEOCODE_RETRIES && current.status === 'needs_geocode') {
      const existingReasons = toFailureReasons(current.failure_reasons)
      const mergedReasons = appendFailureReason(existingReasons, 'geocode_failed')
      const { error: terminalError } = await fromBase(admin, 'ingested_sales')
        .update({
          status: 'needs_check',
          failure_reasons: mergedReasons,
        })
        .eq('id', rowId)
        .eq('status', 'needs_geocode')
      if (!terminalError) {
        logger.warn('geocode terminal failure', {
          component: 'ingestion/geocodeWorker',
          operation: 'terminal_failure_preclaim',
          rowId,
          attemptCount: Number(current.geocode_attempts || 0),
        })
      }
    }
    return null
  }

  const lastAttemptAt = current.last_geocode_attempt_at ? new Date(current.last_geocode_attempt_at).getTime() : 0
  if (lastAttemptAt && lastAttemptAt > Date.now() - cooldownMinutes * 60 * 1000) {
    return null
  }

  const currentAttempts = Number(current.geocode_attempts || 0)
  let claimQuery = fromBase(admin, 'ingested_sales')
    .update({
      geocode_attempts: currentAttempts + 1,
      last_geocode_attempt_at: nowIso,
    })
    .eq('id', rowId)
    .eq('status', 'needs_geocode')
    .eq('geocode_attempts', currentAttempts)
    .select('id, normalized_address, city, state, geocode_attempts, failure_reasons')

  if (current.last_geocode_attempt_at) {
    claimQuery = claimQuery.lt('last_geocode_attempt_at', cutoffIso)
  }

  const { data: claimed, error: claimError } = await claimQuery.maybeSingle()
  if (claimError) {
    logger.error('Failed to claim row for queued geocode', new Error(claimError.message), {
      component: 'ingestion/geocodeWorker',
      operation: 'claim_row_by_id',
      rowId,
    })
    return null
  }
  if (!claimed) return null

  const claimedRow = claimed as ClaimedGeocodeRow
  const rowResult = await processClaimedRow(admin, claimedRow)
  if (rowResult.success && !options?.skipPublishAfterSuccess) {
    await publishAfterGeocodeSuccess({ source: 'single', succeededCount: 1 })
  }
  return rowResult
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
  const summary: GeocodeWorkerSummary = {
    claimed: claimedRows.length,
    succeeded: 0,
    failedRetriable: 0,
    failedTerminal: 0,
  }

  for (const row of claimedRows) {
    const result = await processClaimedRow(admin, row)
    if (result.success) {
      summary.succeeded += 1
    } else if (result.terminalFailure) {
      summary.failedTerminal += 1
    } else {
      summary.failedRetriable += 1
    }
  }

  logger.info('Geocode worker completed batch', {
    component: 'ingestion/geocodeWorker',
    operation: 'batch_complete',
    batchSize,
    claimed: summary.claimed,
    succeeded: summary.succeeded,
    failedRetriable: summary.failedRetriable,
    failedTerminal: summary.failedTerminal,
  })

  if (summary.succeeded > 0) {
    await publishAfterGeocodeSuccess({ source: 'batch', succeededCount: summary.succeeded })
  }

  return summary
}

