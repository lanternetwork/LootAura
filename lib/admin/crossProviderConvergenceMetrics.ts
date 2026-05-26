import { EXTERNAL_INGEST_PLATFORMS } from '@/lib/ingestion/identity/backfillCanonicalSaleInstanceKey'
import {
  computeCrossProviderConvergenceSloAttainment,
  type CrossProviderConvergenceSloAttainment,
  type CrossProviderConvergenceSloTrendPoint,
} from '@/lib/admin/crossProviderConvergenceSloAttainment'
export {
  CROSS_PROVIDER_AMBIGUOUS_SHARE_MAX,
  CROSS_PROVIDER_PUBLISH_LINK_RATE_MIN,
} from '@/lib/admin/crossProviderConvergenceThresholds'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type CrossProviderConvergenceMetrics = {
  duplicatePublishedCanonicalClusters: number
  observationPublished24h: number
  crossProviderShadowMatches24h: number
  publishLinkRate24h: number | null
  ambiguousDispositionCount7d: number
  ambiguousDispositionShare7d: number | null
  sloAttainment: CrossProviderConvergenceSloAttainment
  sloTrend: CrossProviderConvergenceSloTrendPoint[]
}

export const EMPTY_CROSS_PROVIDER_CONVERGENCE_METRICS: CrossProviderConvergenceMetrics = {
  duplicatePublishedCanonicalClusters: 0,
  observationPublished24h: 0,
  crossProviderShadowMatches24h: 0,
  publishLinkRate24h: null,
  ambiguousDispositionCount7d: 0,
  ambiguousDispositionShare7d: null,
  sloAttainment: {
    requiredConsecutiveDays: 14,
    consecutiveZeroDuplicateDays: 0,
    latestDayQualifies: false,
    programComplete: false,
  },
  sloTrend: [],
}

function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

/**
 * Operational SLO: canonical keys with more than one distinct published_sale_id across external ingests.
 */
export async function countDuplicatePublishedCanonicalClusters(
  admin: ReturnType<typeof getAdminDb>
): Promise<number> {
  const platforms = [...EXTERNAL_INGEST_PLATFORMS]
  const pageSize = 500
  let from = 0
  const saleIdsByCanonical = new Map<string, Set<string>>()

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('canonical_sale_instance_key, published_sale_id')
      .in('source_platform', platforms)
      .eq('status', 'published')
      .not('canonical_sale_instance_key', 'is', null)
      .not('published_sale_id', 'is', null)
      .is('superseded_by_ingested_sale_id', null)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = data ?? []
    for (const row of chunk as Array<{
      canonical_sale_instance_key?: string | null
      published_sale_id?: string | null
    }>) {
      const key = row.canonical_sale_instance_key?.trim()
      const saleId = row.published_sale_id?.trim()
      if (!key || !saleId) continue
      let set = saleIdsByCanonical.get(key)
      if (!set) {
        set = new Set()
        saleIdsByCanonical.set(key, set)
      }
      set.add(saleId)
    }

    if (chunk.length < pageSize) break
    from += pageSize
  }

  let clusters = 0
  for (const saleIds of saleIdsByCanonical.values()) {
    if (saleIds.size > 1) clusters += 1
  }
  return clusters
}

async function loadSloTrend(
  admin: ReturnType<typeof getAdminDb>,
  limitDays = 30
): Promise<CrossProviderConvergenceSloTrendPoint[]> {
  const { data, error } = await fromBase(admin, 'cross_provider_convergence_slo_daily')
    .select('slo_date, duplicate_published_canonical_clusters, recorded_at')
    .order('slo_date', { ascending: false })
    .limit(limitDays)
  if (error) throw new Error(error.message)

  return (data ?? [])
    .map((row) => {
      const r = row as {
        slo_date: string
        duplicate_published_canonical_clusters: number
        recorded_at: string
      }
      return {
        sloDate: r.slo_date,
        duplicatePublishedCanonicalClusters: r.duplicate_published_canonical_clusters,
        recordedAt: r.recorded_at,
      }
    })
    .reverse()
}

export async function recordCrossProviderConvergenceSloDailySnapshot(
  admin: ReturnType<typeof getAdminDb>,
  duplicateClusters: number,
  nowMs: number = Date.now()
): Promise<void> {
  const sloDate = utcDayKey(nowMs)
  const { error } = await fromBase(admin, 'cross_provider_convergence_slo_daily').upsert(
    {
      slo_date: sloDate,
      duplicate_published_canonical_clusters: duplicateClusters,
      recorded_at: new Date(nowMs).toISOString(),
    },
    { onConflict: 'slo_date' }
  )
  if (error) throw new Error(error.message)
}

export async function loadCrossProviderConvergenceMetrics(
  nowMs: number = Date.now()
): Promise<CrossProviderConvergenceMetrics> {
  const admin = getAdminDb()
  const since24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
  const platforms = [...EXTERNAL_INGEST_PLATFORMS]

  const duplicatePublishedCanonicalClusters = await countDuplicatePublishedCanonicalClusters(admin)
  await recordCrossProviderConvergenceSloDailySnapshot(
    admin,
    duplicatePublishedCanonicalClusters,
    nowMs
  )
  const sloTrend = await loadSloTrend(admin)
  const sloAttainment = computeCrossProviderConvergenceSloAttainment({
    trend: sloTrend,
    currentDuplicateClusters: duplicatePublishedCanonicalClusters,
  })

  const { count: observationPublished24h, error: obsErr } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .in('source_platform', platforms)
    .eq('status', 'published')
    .eq('is_duplicate', true)
    .gte('published_at', since24h)
  if (obsErr) throw new Error(obsErr.message)

  const crossProviderDispositions = [
    'would_link_observation',
    'would_suppress_publish',
    'would_observation_review',
  ] as const

  const { count: crossProviderShadowMatches24h, error: matchErr } = await fromBase(
    admin,
    'cross_provider_sale_instance_shadow'
  )
    .select('id', { count: 'exact', head: true })
    .gte('recorded_at', since24h)
    .in('disposition', [...crossProviderDispositions])
  if (matchErr) throw new Error(matchErr.message)

  const matches = crossProviderShadowMatches24h ?? 0
  const observations = observationPublished24h ?? 0
  const publishLinkRate24h =
    matches > 0 ? Math.min(1, observations / matches) : null

  const { count: shadowTotal7d, error: total7Err } = await fromBase(
    admin,
    'cross_provider_sale_instance_shadow'
  )
    .select('id', { count: 'exact', head: true })
    .gte('recorded_at', since7d)
  if (total7Err) throw new Error(total7Err.message)

  const { count: ambiguousDispositionCount7d, error: ambErr } = await fromBase(
    admin,
    'cross_provider_sale_instance_shadow'
  )
    .select('id', { count: 'exact', head: true })
    .gte('recorded_at', since7d)
    .eq('disposition', 'would_observation_review')
  if (ambErr) throw new Error(ambErr.message)

  const total7 = shadowTotal7d ?? 0
  const ambiguous = ambiguousDispositionCount7d ?? 0
  const ambiguousDispositionShare7d = total7 > 0 ? ambiguous / total7 : null

  return {
    duplicatePublishedCanonicalClusters,
    observationPublished24h: observations,
    crossProviderShadowMatches24h: matches,
    publishLinkRate24h,
    ambiguousDispositionCount7d: ambiguous,
    ambiguousDispositionShare7d,
    sloAttainment,
    sloTrend,
  }
}
