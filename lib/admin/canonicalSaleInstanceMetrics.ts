import { EXTERNAL_INGEST_PLATFORMS } from '@/lib/ingestion/identity/backfillCanonicalSaleInstanceKey'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type CanonicalSaleInstanceMetrics = {
  externalRowsWithCanonicalKey: number
  externalActiveRowsWithCanonicalKey: number
  externalPublishedActiveWithCanonicalKey: number
  externalActiveEligible: number
  canonicalCoveragePct: number | null
  canonicalCollisionGroups: number
  crossProviderCanonicalGroups: number
  sampleCrossProviderCanonicalKeys: string[]
}

/** Test / mock fixture for scoreboard payloads. */
export const EMPTY_CANONICAL_SALE_INSTANCE_METRICS: CanonicalSaleInstanceMetrics = {
  externalRowsWithCanonicalKey: 0,
  externalActiveRowsWithCanonicalKey: 0,
  externalPublishedActiveWithCanonicalKey: 0,
  externalActiveEligible: 0,
  canonicalCoveragePct: null,
  canonicalCollisionGroups: 0,
  crossProviderCanonicalGroups: 0,
  sampleCrossProviderCanonicalKeys: [],
}

/**
 * Phase A observability: canonical key coverage on external ingested rows (YSTM + ES.net).
 */
export async function loadCanonicalSaleInstanceMetrics(): Promise<CanonicalSaleInstanceMetrics> {
  const admin = getAdminDb()
  const platforms = [...EXTERNAL_INGEST_PLATFORMS]

  const { count: withKey, error: withKeyErr } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .in('source_platform', platforms)
    .not('canonical_sale_instance_key', 'is', null)
  if (withKeyErr) throw new Error(withKeyErr.message)

  const { count: activeWithKey, error: activeKeyErr } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .in('source_platform', platforms)
    .not('canonical_sale_instance_key', 'is', null)
    .is('superseded_by_ingested_sale_id', null)
    .eq('is_duplicate', false)
  if (activeKeyErr) throw new Error(activeKeyErr.message)

  const { count: publishedActiveWithKey, error: pubErr } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .in('source_platform', platforms)
    .not('canonical_sale_instance_key', 'is', null)
    .not('published_sale_id', 'is', null)
    .is('superseded_by_ingested_sale_id', null)
    .eq('is_duplicate', false)
  if (pubErr) throw new Error(pubErr.message)

  const { count: activeEligible, error: eligibleErr } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .in('source_platform', platforms)
    .is('superseded_by_ingested_sale_id', null)
    .eq('is_duplicate', false)
  if (eligibleErr) throw new Error(eligibleErr.message)

  const { data: collisionRows, error: collisionErr } = await fromBase(admin, 'ingested_sales')
    .select('canonical_sale_instance_key, source_platform')
    .in('source_platform', platforms)
    .not('canonical_sale_instance_key', 'is', null)
    .is('superseded_by_ingested_sale_id', null)
    .eq('is_duplicate', false)
    .limit(5000)
  if (collisionErr) throw new Error(collisionErr.message)

  const keyCounts = new Map<string, number>()
  const platformsByKey = new Map<string, Set<string>>()

  for (const row of collisionRows ?? []) {
    const key = (row as { canonical_sale_instance_key?: string }).canonical_sale_instance_key
    const platform = (row as { source_platform?: string }).source_platform
    if (!key) continue
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
    if (platform) {
      const set = platformsByKey.get(key) ?? new Set<string>()
      set.add(platform)
      platformsByKey.set(key, set)
    }
  }

  const collisionGroups = [...keyCounts.entries()].filter(([, n]) => n > 1)
  const crossProviderGroups = collisionGroups.filter(([key]) => {
    const platformsForKey = platformsByKey.get(key)
    return platformsForKey != null && platformsForKey.size > 1
  })

  crossProviderGroups.sort((a, b) => b[1] - a[1])

  const eligible = activeEligible ?? 0
  const coveragePct =
    eligible > 0 ? Math.round(((activeWithKey ?? 0) / eligible) * 1000) / 10 : null

  return {
    externalRowsWithCanonicalKey: withKey ?? 0,
    externalActiveRowsWithCanonicalKey: activeWithKey ?? 0,
    externalPublishedActiveWithCanonicalKey: publishedActiveWithKey ?? 0,
    externalActiveEligible: eligible,
    canonicalCoveragePct: coveragePct,
    canonicalCollisionGroups: collisionGroups.length,
    crossProviderCanonicalGroups: crossProviderGroups.length,
    sampleCrossProviderCanonicalKeys: crossProviderGroups.slice(0, 5).map(([k]) => k),
  }
}
