import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import {
  classifyAddressEnrichmentPendingCohortRow,
  evaluateAddressEnrichmentClaimEligibility,
  isAddressEnrichmentDrainCohortRow,
  mapAddressEnrichmentFailureSubtype,
} from '@/lib/ingestion/address/classifyAddressEnrichmentPendingCohort'
import {
  ADDRESS_ENRICHMENT_FAILURE_SUBTYPES,
  ADDRESS_ENRICHMENT_PENDING_COHORT_CLASSIFICATIONS,
  type AddressEnrichmentDrainCohortAnalysis,
  type AddressEnrichmentFailureSubtype,
  type AddressEnrichmentPendingCohortClassification,
} from '@/lib/ingestion/address/addressEnrichmentDrainTypes'

type CohortDbRow = {
  id: string
  status: string | null
  address_status: string | null
  coordinate_precision: string | null
  address_enrichment_attempts: number | null
  next_enrichment_attempt_at: string | null
  address_unlock_at: string | null
  last_address_enrichment_attempt_at: string | null
  address_enrichment_failure_reason: string | null
  failure_details: unknown
}

function emptyClassificationCounts(): Record<
  AddressEnrichmentPendingCohortClassification,
  number
> {
  return Object.fromEntries(
    ADDRESS_ENRICHMENT_PENDING_COHORT_CLASSIFICATIONS.map((key) => [key, 0])
  ) as Record<AddressEnrichmentPendingCohortClassification, number>
}

function emptyFailureCounts(): Record<AddressEnrichmentFailureSubtype, number> {
  return Object.fromEntries(
    ADDRESS_ENRICHMENT_FAILURE_SUBTYPES.map((key) => [key, 0])
  ) as Record<AddressEnrichmentFailureSubtype, number>
}

/**
 * Workstreams A–B — read-only scan of address_enrichment_pending × provider_native cohort.
 */
export async function analyzeAddressEnrichmentDrainCohort(
  now: Date = new Date()
): Promise<AddressEnrichmentDrainCohortAnalysis> {
  const admin = getAdminDb()
  const nowMs = now.getTime()
  const pageSize = 1000
  let from = 0

  const byClassification = emptyClassificationCounts()
  const byFailureSubtype = emptyFailureCounts()
  let scanned = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, status, address_status, coordinate_precision, address_enrichment_attempts, next_enrichment_attempt_at, address_unlock_at, last_address_enrichment_attempt_at, address_enrichment_failure_reason, failure_details'
      )
      .eq('status', 'needs_check')
      .eq('address_status', 'address_enrichment_pending')
      .eq('coordinate_precision', 'provider_native')
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const chunk = (Array.isArray(data) ? data : []) as CohortDbRow[]

    for (const row of chunk) {
      if (
        !isAddressEnrichmentDrainCohortRow({
          status: row.status,
          addressStatus: row.address_status,
          coordinatePrecision: row.coordinate_precision,
        })
      ) {
        continue
      }

      scanned += 1
      const cohortRow = {
        id: String(row.id),
        addressStatus: row.address_status,
        coordinatePrecision: row.coordinate_precision,
        status: row.status,
        addressEnrichmentAttempts: row.address_enrichment_attempts ?? 0,
        nextEnrichmentAttemptAt: row.next_enrichment_attempt_at,
        addressUnlockAt: row.address_unlock_at,
        lastAddressEnrichmentAttemptAt: row.last_address_enrichment_attempt_at,
        addressEnrichmentFailureReason: row.address_enrichment_failure_reason,
        failureDetails: row.failure_details,
      }

      const classification = classifyAddressEnrichmentPendingCohortRow(cohortRow, nowMs)
      byClassification[classification] += 1

      const claimable = evaluateAddressEnrichmentClaimEligibility(cohortRow, nowMs).claimable
      const failureSubtype = mapAddressEnrichmentFailureSubtype({
        addressEnrichmentFailureReason: cohortRow.addressEnrichmentFailureReason,
        failureDetails: cohortRow.failureDetails,
        addressEnrichmentAttempts: cohortRow.addressEnrichmentAttempts,
        claimable,
      })
      byFailureSubtype[failureSubtype] += 1
    }

    if (chunk.length < pageSize) {
      break
    }
    from += pageSize
  }

  const dominantFailureSubtype =
    [...ADDRESS_ENRICHMENT_FAILURE_SUBTYPES]
      .filter((key) => byFailureSubtype[key] > 0)
      .sort((a, b) => byFailureSubtype[b] - byFailureSubtype[a])[0] ?? null

  return {
    cohortKey: 'address_enrichment_pending_x_provider_native',
    total: scanned,
    scanned,
    byClassification,
    byFailureSubtype,
    dominantFailureSubtype,
  }
}
