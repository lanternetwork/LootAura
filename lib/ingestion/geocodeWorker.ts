import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { geocodeAddress } from '@/lib/geocode/geocodeAddress'
import { logger } from '@/lib/log'
import type { FailureReason } from '@/lib/ingestion/types'

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
        if (!updateError) {
          success = true
          summary.succeeded += 1
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
      continue
    }

    if (attemptCount >= 3) {
      const existingReasons = toFailureReasons(row.failure_reasons)
      const mergedReasons = appendFailureReason(existingReasons, 'geocode_failed')
      const { error: terminalError } = await fromBase(admin, 'ingested_sales')
        .update({
          status: 'needs_check',
          failure_reasons: mergedReasons,
        })
        .eq('id', rowId)
      if (terminalError) {
        logger.error('Failed to mark row as needs_check after geocode retries', new Error(terminalError.message), {
          component: 'ingestion/geocodeWorker',
          operation: 'mark_needs_check',
          rowId,
          attemptCount,
        })
      } else {
        summary.failedTerminal += 1
      }
      logger.warn('Geocode worker row processed', {
        component: 'ingestion/geocodeWorker',
        operation: 'row_result',
        rowId,
        attemptCount,
        result: 'failed_terminal',
      })
      continue
    }

    summary.failedRetriable += 1
    logger.warn('Geocode worker row processed', {
      component: 'ingestion/geocodeWorker',
      operation: 'row_result',
      rowId,
      attemptCount,
      result: 'failed_retriable',
    })
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

  return summary
}

