import {
  MAX_ADDRESS_ENRICHMENT_ATTEMPTS,
  type AddressStatus,
} from '@/lib/ingestion/address/addressLifecycleTypes'
import { mergeAddressEnrichmentDetails } from '@/lib/ingestion/address/addressEnrichmentFailureDetails'
import { terminalActiveAddressStatusForEntry } from '@/lib/ingestion/address/terminalAddressDisposition'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type ReconcileExhaustedAddressEnrichmentSummary = {
  scanned: number
  reconciled: number
  skipped: number
}

const RECONCILE_STATUSES: AddressStatus[] = [
  'address_enrichment_pending',
  'address_enrichment_retry',
]

/**
 * Workstream D — move claim-exhausted rows out of active pending inventory.
 */
export async function reconcileExhaustedAddressEnrichmentPending(options?: {
  batchSize?: number
}): Promise<ReconcileExhaustedAddressEnrichmentSummary> {
  const admin = getAdminDb()
  const batchSize = Math.min(Math.max(options?.batchSize ?? 500, 1), 1000)
  const summary: ReconcileExhaustedAddressEnrichmentSummary = {
    scanned: 0,
    reconciled: 0,
    skipped: 0,
  }

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, failure_details, address_enrichment_attempts')
    .in('address_status', RECONCILE_STATUSES)
    .gte('address_enrichment_attempts', MAX_ADDRESS_ENRICHMENT_ATTEMPTS)
    .limit(batchSize)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    summary.scanned += 1
    const rowId = String(row.id)
    const attempts = (row as { address_enrichment_attempts?: number }).address_enrichment_attempts ?? 0

    const { data: updated, error: updateError } = await fromBase(admin, 'ingested_sales')
      .update({
        address_status: terminalActiveAddressStatusForEntry(),
        address_enrichment_failure_reason: 'max_attempts_exceeded',
        next_enrichment_attempt_at: null,
        status: 'needs_check',
        failure_details: mergeAddressEnrichmentDetails(
          (row as { failure_details?: unknown }).failure_details,
          {
            lastReason: 'max_attempts_exceeded',
            attemptCount: attempts,
            reconciledExhausted: true,
            recordTerminalEntry: true,
          }
        ),
      })
      .eq('id', rowId)
      .in('address_status', RECONCILE_STATUSES)
      .gte('address_enrichment_attempts', MAX_ADDRESS_ENRICHMENT_ATTEMPTS)
      .select('id')
      .maybeSingle()

    if (updateError) {
      logger.error('Exhausted address enrichment reconcile failed', new Error(updateError.message), {
        component: 'ingestion/address/reconcileExhaustedAddressEnrichmentPending',
        rowId,
      })
      summary.skipped += 1
      continue
    }

    if (updated?.id) {
      summary.reconciled += 1
    } else {
      summary.skipped += 1
    }
  }

  return summary
}
