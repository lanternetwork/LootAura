import {
  classifyPublishedNotVisibleBucket,
  passesPhase4PublicVisibility,
} from '@/lib/admin/classifyPublishedNotVisibleBucket'
import {
  PUBLISHED_NOT_VISIBLE_BUCKETS,
  type PublishedNotVisibleClassifiedRow,
  type PublishedNotVisibleDistributionAnalysis,
  type PublishedNotVisibleIngestedRow,
  type PublishedNotVisibleObservationRow,
  type PublishedNotVisibleSaleRow,
} from '@/lib/admin/publishedNotVisibleDistributionTypes'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { classifyMissingValidReconciliation } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliation'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PAGE_SIZE = 500

function emptyBucketCounts(): Record<
  (typeof PUBLISHED_NOT_VISIBLE_BUCKETS)[number],
  number
> {
  return Object.fromEntries(PUBLISHED_NOT_VISIBLE_BUCKETS.map((b) => [b, 0])) as Record<
    (typeof PUBLISHED_NOT_VISIBLE_BUCKETS)[number],
    number
  >
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

function classifyRow(input: {
  observation: PublishedNotVisibleObservationRow
  ingested: PublishedNotVisibleIngestedRow | null
  salesById: Map<string, PublishedNotVisibleSaleRow>
  visibleCanonicalUrls: Set<string>
  nowMs: number
}): PublishedNotVisibleClassifiedRow {
  const { observation, ingested, salesById, visibleCanonicalUrls, nowMs } = input
  const linkedSaleId = resolveLinkedSaleId(observation, ingested)
  const linkedSale = linkedSaleId ? salesById.get(linkedSaleId) ?? null : null
  const canonical = canonicalSourceUrl(observation.canonical_url)
  const secondaryTags = observation.false_exclusion_secondary_tags ?? []

  const bucket = classifyPublishedNotVisibleBucket({
    observation,
    ingested,
    linkedSale,
    linkedSaleId,
    visibleInPublishedIndex: visibleCanonicalUrls.has(canonical),
    nowMs,
  })

  const reconciliationClass = classifyMissingValidReconciliation({
    primaryBucket: 'published_not_visible',
    secondaryTags,
    ingested: ingested
      ? {
          address_status: null,
          status: ingested.status,
          published_sale_id: ingested.published_sale_id,
          is_duplicate: ingested.is_duplicate,
          failure_reasons: [],
        }
      : null,
    observation: {
      missing_ingestion_outcome: observation.missing_ingestion_outcome,
      missing_ingestion_failure_reason: observation.missing_ingestion_failure_reason,
      missing_ingestion_replay_count: observation.missing_ingestion_replay_count ?? 0,
    },
    linkedSale: linkedSale
      ? {
          status: linkedSale.status,
          archived_at: linkedSale.archived_at,
          ends_at: linkedSale.ends_at,
          moderation_status: linkedSale.moderation_status,
        }
      : null,
    wouldPublishShadow: false,
    visibleInPublishedIndex: visibleCanonicalUrls.has(canonical),
    nowMs,
  })

  return {
    canonicalUrl: observation.canonical_url,
    bucket,
    reconciliationClass,
    visibilityFilterZombie: reconciliationClass === 'VISIBILITY_FILTER',
    observationStaleTag: secondaryTags.includes('observation_stale'),
    passesPhase4PublicVisibility: linkedSale ? passesPhase4PublicVisibility(linkedSale, nowMs) : false,
    matchedSaleId: observation.matched_sale_id,
    matchedIngestedSaleId: observation.matched_ingested_sale_id,
    ingestedSaleId: ingested?.id ?? null,
    ingestedPublishedSaleId: ingested?.published_sale_id ?? null,
    saleId: linkedSale?.id ?? linkedSaleId,
    appearanceSource: observation.appearance_source,
    matchMethod: observation.match_method,
    secondaryTags,
    endsAt: linkedSale?.ends_at ?? null,
    archivedAt: linkedSale?.archived_at ?? null,
    moderationStatus: linkedSale?.moderation_status ?? null,
    saleStatus: linkedSale?.status ?? null,
  }
}

/**
 * PUBLISHED_NOT_VISIBLE_DISTRIBUTION_V2 — read-only audit of published_not_visible cohort.
 */
export async function analyzePublishedNotVisibleDistribution(
  now: Date = new Date()
): Promise<PublishedNotVisibleDistributionAnalysis> {
  const admin = getAdminDb()
  const nowMs = now.getTime()

  const cohort = await fetchCohort(admin)
  const canonicalUrls = [...new Set(cohort.map((row) => row.canonical_url))]

  const [ingestedByUrl, publishedIndex] = await Promise.all([
    fetchIngestedByUrls(admin, canonicalUrls),
    loadLootAuraPublishedYstmIndex(admin, now),
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

  const byBucket = emptyBucketCounts()
  const byReconciliationClass: Record<string, number> = {}
  let visibilityFilterZombieCount = 0
  let observationStaleTagCount = 0
  let publishHookCount = 0
  const classifiedRows: PublishedNotVisibleClassifiedRow[] = []

  for (const observation of cohort) {
    const ingested =
      ingestedByUrl.get(observation.canonical_url) ??
      ingestedByUrl.get(canonicalSourceUrl(observation.canonical_url)) ??
      null

    const classified = classifyRow({
      observation,
      ingested,
      salesById,
      visibleCanonicalUrls: publishedIndex.visibleCanonicalUrls,
      nowMs,
    })

    classifiedRows.push(classified)
    byBucket[classified.bucket] += 1
    byReconciliationClass[classified.reconciliationClass] =
      (byReconciliationClass[classified.reconciliationClass] ?? 0) + 1

    if (classified.visibilityFilterZombie) visibilityFilterZombieCount += 1
    if (classified.observationStaleTag) observationStaleTagCount += 1
    if (observation.appearance_source === 'publish_hook') publishHookCount += 1
  }

  return {
    generatedAt: now.toISOString(),
    cohortTotal: cohort.length,
    byBucket,
    byReconciliationClass,
    visibilityFilterZombieCount,
    observationStaleTagCount,
    publishHookCount,
    classifiedRows,
  }
}
