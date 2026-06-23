import { evaluateAddressEnrichmentClaimEligibility } from '@/lib/ingestion/address/classifyAddressEnrichmentPendingCohort'
import { isUnlockScheduledInFuture } from '@/lib/ingestion/address/resolveEnrichmentAddressCandidate'

export type ScheduleWaitFalseExclusionIngestedSnapshot = {
  address_status: string | null
  source_url: string
  address_enrichment_attempts: number | null
  next_enrichment_attempt_at: string | null
  address_unlock_at: string | null
  last_address_enrichment_attempt_at: string | null
}

/**
 * GATED_FALSE_POSITIVE_RECONCILIATION_V1 — expected address-gated unlock schedule waits.
 */
export function isScheduleWaitFalseExclusion(input: {
  ingested: ScheduleWaitFalseExclusionIngestedSnapshot | null
  sourceUrl: string
  nowMs: number
}): boolean {
  const ingested = input.ingested
  if (!ingested || ingested.address_status !== 'address_gated') {
    return false
  }

  const attempts = ingested.address_enrichment_attempts ?? 0
  const eligibility = evaluateAddressEnrichmentClaimEligibility(
    {
      addressStatus: ingested.address_status,
      addressEnrichmentAttempts: attempts,
      nextEnrichmentAttemptAt: ingested.next_enrichment_attempt_at,
      addressUnlockAt: ingested.address_unlock_at,
      lastAddressEnrichmentAttemptAt: ingested.last_address_enrichment_attempt_at,
    },
    input.nowMs
  )

  if (eligibility.claimable || eligibility.skipReason !== 'unlock_scheduled') {
    return false
  }

  return isUnlockScheduledInFuture({
    sourceUrl: ingested.source_url || input.sourceUrl,
    addressUnlockAt: ingested.address_unlock_at,
    nowMs: input.nowMs,
  })
}
