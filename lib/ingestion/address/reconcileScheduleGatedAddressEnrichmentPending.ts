import {
  DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES,
  evaluateAddressEnrichmentClaimEligibility,
} from '@/lib/ingestion/address/classifyAddressEnrichmentPendingCohort'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type ReconcileScheduleGatedAddressEnrichmentSummary = {
  scanned: number
  reconciled: number
  skipped: number
}

type ReconcileRow = {
  id: string
  address_status: string | null
  address_enrichment_attempts: number | null
  next_enrichment_attempt_at: string | null
  address_unlock_at: string | null
  last_address_enrichment_attempt_at: string | null
}

export function shouldReclassifyScheduleGatedAddressEnrichmentPending(
  row: Pick<
    ReconcileRow,
    | 'address_status'
    | 'address_enrichment_attempts'
    | 'next_enrichment_attempt_at'
    | 'address_unlock_at'
    | 'last_address_enrichment_attempt_at'
  >,
  nowMs: number,
  cooldownMinutes: number = DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES
): boolean {
  if (row.address_status !== 'address_enrichment_pending') {
    return false
  }

  const eligibility = evaluateAddressEnrichmentClaimEligibility(
    {
      addressStatus: row.address_status,
      addressEnrichmentAttempts: row.address_enrichment_attempts ?? 0,
      nextEnrichmentAttemptAt: row.next_enrichment_attempt_at,
      addressUnlockAt: row.address_unlock_at,
      lastAddressEnrichmentAttemptAt: row.last_address_enrichment_attempt_at,
    },
    nowMs,
    cooldownMinutes
  )

  if (eligibility.claimable) {
    return false
  }

  return (
    eligibility.skipReason === 'unlock_scheduled' ||
    eligibility.skipReason === 'next_attempt_scheduled'
  )
}

/**
 * Reclassify schedule-blocked `address_enrichment_pending` rows to `address_gated`
 * so enrichment backlog metrics reflect claimable work only.
 */
export async function reconcileScheduleGatedAddressEnrichmentPending(options?: {
  batchSize?: number
  now?: Date
  cooldownMinutes?: number
}): Promise<ReconcileScheduleGatedAddressEnrichmentSummary> {
  const admin = getAdminDb()
  const batchSize = Math.min(Math.max(options?.batchSize ?? 500, 1), 1000)
  const nowMs = (options?.now ?? new Date()).getTime()
  const cooldownMinutes = options?.cooldownMinutes ?? DEFAULT_ADDRESS_ENRICHMENT_CLAIM_COOLDOWN_MINUTES
  const summary: ReconcileScheduleGatedAddressEnrichmentSummary = {
    scanned: 0,
    reconciled: 0,
    skipped: 0,
  }

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select(
      'id, address_status, address_enrichment_attempts, next_enrichment_attempt_at, address_unlock_at, last_address_enrichment_attempt_at'
    )
    .eq('address_status', 'address_enrichment_pending')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of (data ?? []) as ReconcileRow[]) {
    summary.scanned += 1
    if (!shouldReclassifyScheduleGatedAddressEnrichmentPending(row, nowMs, cooldownMinutes)) {
      summary.skipped += 1
      continue
    }

    if (row.address_status === 'address_gated') {
      summary.skipped += 1
      continue
    }

    const rowId = String(row.id)
    const { data: updated, error: updateError } = await fromBase(admin, 'ingested_sales')
      .update({ address_status: 'address_gated' })
      .eq('id', rowId)
      .eq('address_status', 'address_enrichment_pending')
      .select('id')
      .maybeSingle()

    if (updateError) {
      logger.error(
        'Schedule-gated address enrichment reconcile failed',
        new Error(updateError.message),
        {
          component: 'ingestion/address/reconcileScheduleGatedAddressEnrichmentPending',
          rowId,
        }
      )
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
