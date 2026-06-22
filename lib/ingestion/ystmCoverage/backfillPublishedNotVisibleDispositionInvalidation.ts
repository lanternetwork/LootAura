import { classifyPublishedNotVisibleBucket } from '@/lib/admin/classifyPublishedNotVisibleBucket'
import type {
  PublishedNotVisibleIngestedRow,
  PublishedNotVisibleObservationRow,
  PublishedNotVisibleSaleRow,
} from '@/lib/admin/publishedNotVisibleDistributionTypes'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import {
  buildPublishedNotVisibleDispositionInvalidationFields,
  type PublishedNotVisibleDispositionInvalidReason,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PAGE_SIZE = 500

export type PublishedNotVisibleDispositionBackfillResult = {
  updated: number
  archived: number
  expired: number
}

async function fetchCohort(
  admin: ReturnType<typeof getAdminDb>
): Promise<PublishedNotVisibleObservationRow[]> {
  const rows: PublishedNotVisibleObservationRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select(
        'canonical_url, matched_sale_id, matched_ingested_sale_id, sale_instance_key, lootaura_visible, appearance_source, false_exclusion_secondary_tags, match_method, missing_ingestion_outcome, missing_ingestion_failure_reason, missing_ingestion_replay_count'
      )
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

function resolveLinkedSaleId(
  observation: PublishedNotVisibleObservationRow,
  ingested: PublishedNotVisibleIngestedRow | null
): string | null {
  return ingested?.published_sale_id?.trim() || observation.matched_sale_id?.trim() || null
}

function bucketToInvalidReason(
  bucket: ReturnType<typeof classifyPublishedNotVisibleBucket>
): PublishedNotVisibleDispositionInvalidReason | null {
  if (bucket === 'ARCHIVED') return 'archived'
  if (bucket === 'EXPIRED') return 'expired'
  return null
}

/**
 * Idempotent backfill: published_not_visible rows whose linked sale fails Phase 4
 * for archived/expired disposition (PUBLISHED_NOT_VISIBLE_DISPOSITION_REPAIR_V1).
 */
export async function backfillPublishedNotVisibleDispositionInvalidation(
  admin: ReturnType<typeof getAdminDb>,
  nowIso: string = new Date().toISOString(),
  nowMs: number = Date.now()
): Promise<PublishedNotVisibleDispositionBackfillResult> {
  const cohort = await fetchCohort(admin)
  if (cohort.length === 0) {
    return { updated: 0, archived: 0, expired: 0 }
  }

  const canonicalUrls = [...new Set(cohort.map((row) => row.canonical_url))]
  const [ingestedByUrl, publishedIndex] = await Promise.all([
    fetchIngestedByUrls(admin, canonicalUrls),
    loadLootAuraPublishedYstmIndex(admin, new Date(nowMs)),
  ])

  const saleIds = new Set<string>()
  for (const row of cohort) {
    const ingested =
      ingestedByUrl.get(row.canonical_url) ??
      ingestedByUrl.get(canonicalSourceUrl(row.canonical_url)) ??
      null
    const linkedSaleId = resolveLinkedSaleId(row, ingested)
    if (linkedSaleId) saleIds.add(linkedSaleId)
    if (row.matched_sale_id) saleIds.add(row.matched_sale_id.trim())
  }

  const salesById = await fetchSalesByIds(admin, [...saleIds])

  let updated = 0
  let archived = 0
  let expired = 0

  for (const observation of cohort) {
    const ingested =
      ingestedByUrl.get(observation.canonical_url) ??
      ingestedByUrl.get(canonicalSourceUrl(observation.canonical_url)) ??
      null
    const linkedSaleId = resolveLinkedSaleId(observation, ingested)
    const linkedSale = linkedSaleId ? salesById.get(linkedSaleId) ?? null : null
    const canonical = canonicalSourceUrl(observation.canonical_url)

    const bucket = classifyPublishedNotVisibleBucket({
      observation,
      ingested,
      linkedSale,
      linkedSaleId,
      visibleInPublishedIndex: publishedIndex.visibleCanonicalUrls.has(canonical),
      nowMs,
    })

    const invalidReason = bucketToInvalidReason(bucket)
    if (!invalidReason) continue

    const { error } = await fromBase(admin, 'ystm_coverage_observations')
      .update({
        ...buildPublishedNotVisibleDispositionInvalidationFields(invalidReason),
        updated_at: nowIso,
      })
      .eq('canonical_url', observation.canonical_url)
      .eq('ystm_valid_active', true)

    if (error) throw new Error(error.message)

    updated += 1
    if (invalidReason === 'archived') archived += 1
    else expired += 1
  }

  return { updated, archived, expired }
}
