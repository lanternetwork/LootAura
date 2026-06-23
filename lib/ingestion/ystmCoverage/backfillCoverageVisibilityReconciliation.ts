import {
  passesPhase4PublicVisibility,
  resolvePublishedNotVisibleDispositionInvalidReason,
} from '@/lib/admin/classifyPublishedNotVisibleBucket'
import type {
  PublishedNotVisibleIngestedRow,
  PublishedNotVisibleObservationRow,
  PublishedNotVisibleSaleRow,
} from '@/lib/admin/publishedNotVisibleDistributionTypes'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { buildCoverageVisibilityReconciliationFields } from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PAGE_SIZE = 500

export type CoverageVisibilityReconciliationBackfillResult = {
  scanned: number
  updated: number
}

async function fetchCohort(
  admin: ReturnType<typeof getAdminDb>
): Promise<PublishedNotVisibleObservationRow[]> {
  const rows: PublishedNotVisibleObservationRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('canonical_url, matched_sale_id, matched_ingested_sale_id')
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'published_not_visible')
      .order('canonical_url', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const chunk = (Array.isArray(data) ? data : []) as PublishedNotVisibleObservationRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function fetchIngestedByUrls(
  admin: ReturnType<typeof getAdminDb>,
  urls: string[]
): Promise<Map<string, PublishedNotVisibleIngestedRow>> {
  const map = new Map<string, PublishedNotVisibleIngestedRow>()
  if (urls.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('id, source_url, status, published_sale_id, sale_instance_key, is_duplicate')
      .in('source_url', chunk)

    if (error) throw new Error(error.message)

    const pickPreferred = (
      existing: PublishedNotVisibleIngestedRow | undefined,
      candidate: PublishedNotVisibleIngestedRow
    ): PublishedNotVisibleIngestedRow => {
      if (!existing) return candidate
      if (existing.is_duplicate && !candidate.is_duplicate) return candidate
      if (!existing.published_sale_id && candidate.published_sale_id) return candidate
      return existing
    }

    for (const row of (Array.isArray(data) ? data : []) as PublishedNotVisibleIngestedRow[]) {
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
): Promise<Map<string, PublishedNotVisibleIngestedRow>> {
  const map = new Map<string, PublishedNotVisibleIngestedRow>()
  if (ids.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('id, source_url, status, published_sale_id, sale_instance_key, is_duplicate')
      .in('id', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as PublishedNotVisibleIngestedRow[]) {
      map.set(String(row.id), row)
    }
  }

  return map
}

async function fetchSalesByIds(
  admin: ReturnType<typeof getAdminDb>,
  saleIds: string[]
): Promise<Map<string, PublishedNotVisibleSaleRow>> {
  const map = new Map<string, PublishedNotVisibleSaleRow>()
  if (saleIds.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < saleIds.length; i += chunkSize) {
    const chunk = saleIds.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'sales')
      .select('id, status, archived_at, ends_at, moderation_status')
      .in('id', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as PublishedNotVisibleSaleRow[]) {
      map.set(row.id, row)
    }
  }

  return map
}

export function resolveCoverageVisibilityIngestedRow(
  observation: Pick<PublishedNotVisibleObservationRow, 'canonical_url' | 'matched_ingested_sale_id'>,
  ingestedByUrl: Map<string, PublishedNotVisibleIngestedRow>,
  ingestedById: Map<string, PublishedNotVisibleIngestedRow>
): PublishedNotVisibleIngestedRow | null {
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

export function resolveCoverageVisibilityLinkedSaleId(
  observation: Pick<PublishedNotVisibleObservationRow, 'matched_sale_id'>,
  ingested: PublishedNotVisibleIngestedRow | null
): string | null {
  const matchedSaleId = observation.matched_sale_id?.trim()
  if (matchedSaleId) return matchedSaleId

  const publishedSaleId = ingested?.published_sale_id?.trim()
  if (publishedSaleId) return publishedSaleId

  return null
}

function isEligibleForReconciliation(
  linkedSale: PublishedNotVisibleSaleRow | null,
  nowMs: number
): boolean {
  if (!linkedSale) return false
  if (resolvePublishedNotVisibleDispositionInvalidReason(linkedSale, nowMs)) return false
  return passesPhase4PublicVisibility(linkedSale, nowMs)
}

/**
 * Idempotent backfill: published_not_visible rows whose linked sale passes Phase 4
 * (COVERAGE_VISIBILITY_RECONCILIATION_V1).
 */
export async function backfillCoverageVisibilityReconciliation(
  admin: ReturnType<typeof getAdminDb>,
  nowIso: string = new Date().toISOString(),
  nowMs: number = Date.now()
): Promise<CoverageVisibilityReconciliationBackfillResult> {
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

  const saleIds = new Set<string>()
  for (const row of cohort) {
    const ingested = resolveCoverageVisibilityIngestedRow(row, ingestedByUrl, ingestedById)
    const linkedSaleId = resolveCoverageVisibilityLinkedSaleId(row, ingested)
    if (linkedSaleId) saleIds.add(linkedSaleId)
  }

  const salesById = await fetchSalesByIds(admin, [...saleIds])

  let updated = 0

  for (const observation of cohort) {
    const ingested = resolveCoverageVisibilityIngestedRow(observation, ingestedByUrl, ingestedById)
    const linkedSaleId = resolveCoverageVisibilityLinkedSaleId(observation, ingested)
    const linkedSale = linkedSaleId ? salesById.get(linkedSaleId) ?? null : null

    if (!isEligibleForReconciliation(linkedSale, nowMs)) continue

    const { error } = await fromBase(admin, 'ystm_coverage_observations')
      .update({
        ...buildCoverageVisibilityReconciliationFields(),
        updated_at: nowIso,
      })
      .eq('canonical_url', observation.canonical_url)
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)

    if (error) throw new Error(error.message)

    updated += 1
  }

  return { scanned, updated }
}
