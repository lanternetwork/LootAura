import type { FalseExclusionTraceEvidence } from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import {
  isExpiredSkippedExistingInventoryFalseExclusion,
  resolveExpiredSkippedExistingInventoryBucket,
  summaryForExpiredSkippedExistingInventoryBucket,
  type FalseExclusionIngestedRowSnapshot,
} from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'
import { buildUrlReuseExpiredInventoryReclassificationFields } from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PAGE_SIZE = 500

export type UrlReuseExpiredInventoryReclassificationBackfillResult = {
  scanned: number
  updated: number
  terminalDispositionUpdated: number
  expiredFalsePositiveUpdated: number
}

type UrlReuseReclassificationObservationRow = {
  canonical_url: string
  false_exclusion_evidence: FalseExclusionTraceEvidence | null
}

function evidenceEligibleForReclassification(
  evidence: FalseExclusionTraceEvidence | null
): evidence is FalseExclusionTraceEvidence {
  if (!evidence?.hasIngestedRow) return false
  if (evidence.missingIngestionOutcome !== 'skipped_existing') return false
  if (evidence.ingestedPublishedSaleId) return false
  if (evidence.visibleInPublishedIndex) return false
  return evidence.ingestedStatus === 'expired'
}

function ingestedSnapshotFromEvidence(
  evidence: FalseExclusionTraceEvidence
): FalseExclusionIngestedRowSnapshot {
  return {
    id: 'evidence-only',
    source_url: '',
    status: evidence.ingestedStatus ?? 'expired',
    published_sale_id: evidence.ingestedPublishedSaleId,
    is_duplicate: evidence.isDuplicate,
    address_status: evidence.addressStatus,
    failure_reasons: ['sale_expired'],
    date_start: null,
    date_end: null,
    catalog_repair_outcome: null,
    source_listing_id: evidence.sourceListingId,
    sale_instance_key: evidence.saleInstanceKey,
    address_enrichment_attempts: null,
    next_enrichment_attempt_at: null,
    address_unlock_at: null,
    last_address_enrichment_attempt_at: null,
  }
}

async function fetchCohort(
  admin: ReturnType<typeof getAdminDb>
): Promise<UrlReuseReclassificationObservationRow[]> {
  const rows: UrlReuseReclassificationObservationRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('canonical_url, false_exclusion_evidence')
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'url_reuse_suspected')
      .order('canonical_url', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const chunk = (Array.isArray(data) ? data : []) as UrlReuseReclassificationObservationRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

/**
 * Idempotent backfill: url_reuse_suspected observations that are known expired inventory
 * skipped by missing-ingest (URL_REUSE_EXPIRED_INVENTORY_RECLASSIFICATION_V1).
 */
export async function backfillUrlReuseExpiredInventoryReclassification(
  admin: ReturnType<typeof getAdminDb>,
  nowIso: string = new Date().toISOString()
): Promise<UrlReuseExpiredInventoryReclassificationBackfillResult> {
  const cohort = await fetchCohort(admin)
  const scanned = cohort.length
  if (cohort.length === 0) {
    return {
      scanned: 0,
      updated: 0,
      terminalDispositionUpdated: 0,
      expiredFalsePositiveUpdated: 0,
    }
  }

  let updated = 0
  let terminalDispositionUpdated = 0
  let expiredFalsePositiveUpdated = 0

  for (const observation of cohort) {
    const evidence = observation.false_exclusion_evidence
    if (!evidenceEligibleForReclassification(evidence)) {
      continue
    }

    const ingested = ingestedSnapshotFromEvidence(evidence)
    if (
      !isExpiredSkippedExistingInventoryFalseExclusion({
        observation: { missingIngestionOutcome: evidence.missingIngestionOutcome },
        ingested,
        visibleInPublishedIndex: false,
      })
    ) {
      continue
    }

    const bucket = resolveExpiredSkippedExistingInventoryBucket(evidence.addressStatus)
    const summary = summaryForExpiredSkippedExistingInventoryBucket(bucket)

    const { error } = await fromBase(admin, 'ystm_coverage_observations')
      .update({
        ...buildUrlReuseExpiredInventoryReclassificationFields(bucket, summary),
        updated_at: nowIso,
      })
      .eq('canonical_url', observation.canonical_url)
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'url_reuse_suspected')

    if (error) throw new Error(error.message)

    updated += 1
    if (bucket === 'terminal_disposition') {
      terminalDispositionUpdated += 1
    } else {
      expiredFalsePositiveUpdated += 1
    }
  }

  return {
    scanned,
    updated,
    terminalDispositionUpdated,
    expiredFalsePositiveUpdated,
  }
}
