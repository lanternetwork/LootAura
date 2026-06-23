import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import {
  buildScheduleWaitReconciliationFields,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { isScheduleWaitFalseExclusion } from '@/lib/ingestion/ystmCoverage/resolveScheduleWaitFalseExclusion'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PAGE_SIZE = 500

export type ScheduleWaitReconciliationBackfillResult = {
  scanned: number
  updated: number
}

export type ScheduleWaitReconciliationObservationRow = {
  canonical_url: string
  matched_ingested_sale_id: string | null
}

export type ScheduleWaitReconciliationIngestedRow = {
  id: string
  source_url: string
  address_status: string | null
  address_enrichment_attempts: number | null
  next_enrichment_attempt_at: string | null
  address_unlock_at: string | null
  last_address_enrichment_attempt_at: string | null
  published_sale_id: string | null
  is_duplicate: boolean
}

async function fetchCohort(
  admin: ReturnType<typeof getAdminDb>
): Promise<ScheduleWaitReconciliationObservationRow[]> {
  const rows: ScheduleWaitReconciliationObservationRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('canonical_url, matched_ingested_sale_id')
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'gated_false_positive')
      .order('canonical_url', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const chunk = (Array.isArray(data) ? data : []) as ScheduleWaitReconciliationObservationRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function fetchIngestedByUrls(
  admin: ReturnType<typeof getAdminDb>,
  urls: string[]
): Promise<Map<string, ScheduleWaitReconciliationIngestedRow>> {
  const map = new Map<string, ScheduleWaitReconciliationIngestedRow>()
  if (urls.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, address_status, address_enrichment_attempts, next_enrichment_attempt_at, address_unlock_at, last_address_enrichment_attempt_at, published_sale_id, is_duplicate'
      )
      .in('source_url', chunk)

    if (error) throw new Error(error.message)

    const pickPreferred = (
      existing: ScheduleWaitReconciliationIngestedRow | undefined,
      candidate: ScheduleWaitReconciliationIngestedRow
    ): ScheduleWaitReconciliationIngestedRow => {
      if (!existing) return candidate
      if (existing.is_duplicate && !candidate.is_duplicate) return candidate
      if (!existing.published_sale_id && candidate.published_sale_id) return candidate
      return existing
    }

    for (const row of (Array.isArray(data) ? data : []) as ScheduleWaitReconciliationIngestedRow[]) {
      const canonical = canonicalSourceUrl(row.source_url)
      map.set(canonical, pickPreferred(map.get(canonical), row))
      map.set(row.source_url, pickPreferred(map.get(row.source_url), row))
    }
  }

  return map
}

async function fetchIngestedByIds(
  admin: ReturnType<typeof getAdminDb>,
  ids: string[]
): Promise<Map<string, ScheduleWaitReconciliationIngestedRow>> {
  const map = new Map<string, ScheduleWaitReconciliationIngestedRow>()
  if (ids.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, address_status, address_enrichment_attempts, next_enrichment_attempt_at, address_unlock_at, last_address_enrichment_attempt_at, published_sale_id, is_duplicate'
      )
      .in('id', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as ScheduleWaitReconciliationIngestedRow[]) {
      map.set(String(row.id), row)
    }
  }

  return map
}

export function resolveScheduleWaitReconciliationIngestedRow(
  observation: Pick<ScheduleWaitReconciliationObservationRow, 'canonical_url' | 'matched_ingested_sale_id'>,
  ingestedByUrl: Map<string, ScheduleWaitReconciliationIngestedRow>,
  ingestedById: Map<string, ScheduleWaitReconciliationIngestedRow>
): ScheduleWaitReconciliationIngestedRow | null {
  const matchedIngestedId = observation.matched_ingested_sale_id?.trim()
  if (matchedIngestedId) {
    const byId = ingestedById.get(matchedIngestedId)
    if (byId) return byId
  }

  return (
    ingestedByUrl.get(observation.canonical_url) ??
    ingestedByUrl.get(canonicalSourceUrl(observation.canonical_url)) ??
    null
  )
}

export function isEligibleForScheduleWaitReconciliation(
  ingested: ScheduleWaitReconciliationIngestedRow | null,
  canonicalUrl: string,
  nowMs: number
): boolean {
  if (!ingested) return false
  return isScheduleWaitFalseExclusion({
    ingested,
    sourceUrl: canonicalUrl,
    nowMs,
  })
}

/**
 * Idempotent backfill: gated_false_positive observations that are expected unlock schedule waits
 * (GATED_FALSE_POSITIVE_RECONCILIATION_V1).
 */
export async function backfillGatedFalsePositiveScheduleWaitReconciliation(
  admin: ReturnType<typeof getAdminDb>,
  nowIso: string = new Date().toISOString(),
  nowMs: number = Date.now()
): Promise<ScheduleWaitReconciliationBackfillResult> {
  const cohort = await fetchCohort(admin)
  const scanned = cohort.length
  if (cohort.length === 0) {
    return { scanned: 0, updated: 0 }
  }

  const canonicalUrls = [...new Set(cohort.map((row) => row.canonical_url))]
  const ingestedIds = [
    ...new Set(
      cohort
        .map((row) => row.matched_ingested_sale_id?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const [ingestedByUrl, ingestedById] = await Promise.all([
    fetchIngestedByUrls(admin, canonicalUrls),
    fetchIngestedByIds(admin, ingestedIds),
  ])

  let updated = 0

  for (const observation of cohort) {
    const ingested = resolveScheduleWaitReconciliationIngestedRow(
      observation,
      ingestedByUrl,
      ingestedById
    )
    if (!isEligibleForScheduleWaitReconciliation(ingested, observation.canonical_url, nowMs)) {
      continue
    }

    const { error } = await fromBase(admin, 'ystm_coverage_observations')
      .update({
        ...buildScheduleWaitReconciliationFields(),
        updated_at: nowIso,
      })
      .eq('canonical_url', observation.canonical_url)
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'gated_false_positive')

    if (error) throw new Error(error.message)

    updated += 1
  }

  return { scanned, updated }
}
