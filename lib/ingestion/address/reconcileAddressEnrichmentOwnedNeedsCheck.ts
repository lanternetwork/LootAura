import {
  MAX_ADDRESS_ENRICHMENT_ATTEMPTS,
} from '@/lib/ingestion/address/addressLifecycleTypes'
import { mergeAddressEnrichmentDetails } from '@/lib/ingestion/address/addressEnrichmentFailureDetails'
import {
  DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES,
  evaluateAddressEnrichmentClaimEligibility,
} from '@/lib/ingestion/address/classifyAddressEnrichmentPendingCohort'
import { isUnlockScheduledInFuture } from '@/lib/ingestion/address/resolveEnrichmentAddressCandidate'
import {
  isTerminalAddressDisposition,
  terminalActiveAddressStatusForEntry,
} from '@/lib/ingestion/address/terminalAddressDisposition'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type AddressEnrichmentOwnedNeedsCheckReconcileAction =
  | 'reclassify_pending'
  | 'terminal'
  | 'noop'

export type ReconcileAddressEnrichmentOwnedNeedsCheckSummary = {
  scanned: number
  reclassifiedPending: number
  terminalized: number
  skipped: number
}

type ReconcileRow = {
  id: string
  status: string | null
  address_status: string | null
  source_url: string
  address_enrichment_attempts: number | null
  next_enrichment_attempt_at: string | null
  address_unlock_at: string | null
  last_address_enrichment_attempt_at: string | null
  failure_details: unknown
}

const ENRICHMENT_OWNED_STATUSES = new Set(['address_gated', 'address_enrichment_retry'])

export function classifyAddressEnrichmentOwnedNeedsCheckReconciliation(
  row: Pick<
    ReconcileRow,
    | 'status'
    | 'address_status'
    | 'source_url'
    | 'address_enrichment_attempts'
    | 'next_enrichment_attempt_at'
    | 'address_unlock_at'
    | 'last_address_enrichment_attempt_at'
  >,
  nowMs: number,
  cooldownMinutes: number = DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES
): AddressEnrichmentOwnedNeedsCheckReconcileAction {
  if (row.status !== 'needs_check') return 'noop'
  const addressStatus = row.address_status ?? ''
  if (!ENRICHMENT_OWNED_STATUSES.has(addressStatus)) return 'noop'
  if (isTerminalAddressDisposition(addressStatus)) return 'noop'

  const attempts = row.address_enrichment_attempts ?? 0
  if (attempts >= MAX_ADDRESS_ENRICHMENT_ATTEMPTS) {
    return 'terminal'
  }

  const eligibility = evaluateAddressEnrichmentClaimEligibility(
    {
      addressStatus,
      addressEnrichmentAttempts: attempts,
      nextEnrichmentAttemptAt: row.next_enrichment_attempt_at,
      addressUnlockAt: row.address_unlock_at,
      lastAddressEnrichmentAttemptAt: row.last_address_enrichment_attempt_at,
    },
    nowMs,
    cooldownMinutes
  )

  if (addressStatus === 'address_enrichment_retry') {
    return eligibility.skipReason === 'attempts_exhausted' ? 'terminal' : 'noop'
  }

  if (
    isUnlockScheduledInFuture({
      sourceUrl: row.source_url,
      addressUnlockAt: row.address_unlock_at,
      nowMs,
    })
  ) {
    return 'noop'
  }

  if (eligibility.claimable) {
    return 'reclassify_pending'
  }

  if (eligibility.skipReason === 'attempts_exhausted') {
    return 'terminal'
  }

  return 'noop'
}

/**
 * Part B — reconcile enrichment-owned needs_check rows without bypassing enrichment.
 */
export async function reconcileAddressEnrichmentOwnedNeedsCheck(options?: {
  batchSize?: number
  now?: Date
  cooldownMinutes?: number
}): Promise<ReconcileAddressEnrichmentOwnedNeedsCheckSummary> {
  const admin = getAdminDb()
  const batchSize = Math.min(Math.max(options?.batchSize ?? 500, 1), 1000)
  const nowMs = (options?.now ?? new Date()).getTime()
  const cooldownMinutes = options?.cooldownMinutes ?? DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES

  const summary: ReconcileAddressEnrichmentOwnedNeedsCheckSummary = {
    scanned: 0,
    reclassifiedPending: 0,
    terminalized: 0,
    skipped: 0,
  }

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select(
      'id, status, address_status, source_url, address_enrichment_attempts, next_enrichment_attempt_at, address_unlock_at, last_address_enrichment_attempt_at, failure_details'
    )
    .eq('status', 'needs_check')
    .in('address_status', ['address_gated', 'address_enrichment_retry'])
    .limit(batchSize)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of (data ?? []) as ReconcileRow[]) {
    summary.scanned += 1
    const action = classifyAddressEnrichmentOwnedNeedsCheckReconciliation(row, nowMs, cooldownMinutes)
    if (action === 'noop') {
      summary.skipped += 1
      continue
    }

    const rowId = String(row.id)
    const attempts = row.address_enrichment_attempts ?? 0

    if (action === 'reclassify_pending') {
      const { data: updated, error: updateError } = await fromBase(admin, 'ingested_sales')
        .update({ address_status: 'address_enrichment_pending' })
        .eq('id', rowId)
        .eq('status', 'needs_check')
        .eq('address_status', 'address_gated')
        .select('id')
        .maybeSingle()

      if (updateError) {
        logger.error(
          'Address gated recoverable reconcile failed',
          new Error(updateError.message),
          {
            component: 'ingestion/address/reconcileAddressEnrichmentOwnedNeedsCheck',
            rowId,
          }
        )
        summary.skipped += 1
        continue
      }

      if (updated?.id) {
        summary.reclassifiedPending += 1
      } else {
        summary.skipped += 1
      }
      continue
    }

    const { data: updated, error: updateError } = await fromBase(admin, 'ingested_sales')
      .update({
        address_status: terminalActiveAddressStatusForEntry(),
        address_enrichment_failure_reason: 'max_attempts_exceeded',
        next_enrichment_attempt_at: null,
        status: 'needs_check',
        failure_details: mergeAddressEnrichmentDetails(row.failure_details, {
          lastReason: 'max_attempts_exceeded',
          attemptCount: attempts,
          reconciledExhausted: true,
          recordTerminalEntry: true,
        }),
      })
      .eq('id', rowId)
      .eq('status', 'needs_check')
      .in('address_status', ['address_gated', 'address_enrichment_retry'])
      .select('id')
      .maybeSingle()

    if (updateError) {
      logger.error(
        'Address enrichment owned terminal reconcile failed',
        new Error(updateError.message),
        {
          component: 'ingestion/address/reconcileAddressEnrichmentOwnedNeedsCheck',
          rowId,
        }
      )
      summary.skipped += 1
      continue
    }

    if (updated?.id) {
      summary.terminalized += 1
    } else {
      summary.skipped += 1
    }
  }

  return summary
}
