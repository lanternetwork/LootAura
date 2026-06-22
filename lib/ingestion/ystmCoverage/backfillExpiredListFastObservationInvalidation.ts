import {
  buildExpiredObservationInvalidationFields,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type ExpiredListFastObservationBackfillResult = {
  updated: number
}

/**
 * One-time-safe idempotent backfill: hot/warm rows already failed as list-fast expired
 * but still valid-active (pre-YSTM_EXPIRED_OBSERVATION_INVALIDATION_V1).
 */
export async function backfillExpiredListFastObservationInvalidation(
  admin: ReturnType<typeof getAdminDb>,
  nowIso: string = new Date().toISOString()
): Promise<ExpiredListFastObservationBackfillResult> {
  const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
    .update({
      ...buildExpiredObservationInvalidationFields(),
      updated_at: nowIso,
    })
    .eq('ystm_valid_active', true)
    .in('discovery_priority', ['hot', 'warm'])
    .eq('missing_ingestion_outcome', 'failed')
    .eq('missing_ingestion_failure_reason', 'expired')
    .select('canonical_url')

  if (error) {
    throw new Error(error.message)
  }

  return { updated: (data ?? []).length }
}
