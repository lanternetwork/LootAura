import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type SaleInstanceIdentityMetrics = {
  ystmRowsWithKey: number
  ystmActiveRowsWithKey: number
  keyCollisionGroups: number
  sampleCollisionKeys: string[]
}

const YSTM_URL_LIKE = '%yardsaletreasuremap.%'

/**
 * Phase 3 observability: how many YSTM ingested rows have sale_instance_key populated.
 */
export async function loadSaleInstanceIdentityMetrics(): Promise<SaleInstanceIdentityMetrics> {
  const admin = getAdminDb()

  const { count: withKey, error: withKeyErr } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('sale_instance_key', 'is', null)
    .ilike('source_url', YSTM_URL_LIKE)
  if (withKeyErr) throw new Error(withKeyErr.message)

  const { count: activeWithKey, error: activeErr } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('sale_instance_key', 'is', null)
    .is('superseded_by_ingested_sale_id', null)
    .neq('status', 'expired')
    .ilike('source_url', YSTM_URL_LIKE)
  if (activeErr) throw new Error(activeErr.message)

  const { data: collisionRows, error: collisionErr } = await fromBase(admin, 'ingested_sales')
    .select('sale_instance_key')
    .not('sale_instance_key', 'is', null)
    .is('superseded_by_ingested_sale_id', null)
    .ilike('source_url', YSTM_URL_LIKE)
    .limit(5000)
  if (collisionErr) throw new Error(collisionErr.message)

  const counts = new Map<string, number>()
  for (const row of collisionRows ?? []) {
    const key = (row as { sale_instance_key?: string }).sale_instance_key
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const collisionKeys = [...counts.entries()].filter(([, n]) => n > 1)
  collisionKeys.sort((a, b) => b[1] - a[1])

  return {
    ystmRowsWithKey: withKey ?? 0,
    ystmActiveRowsWithKey: activeWithKey ?? 0,
    keyCollisionGroups: collisionKeys.length,
    sampleCollisionKeys: collisionKeys.slice(0, 5).map(([k]) => k),
  }
}
