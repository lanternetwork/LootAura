import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { SeoEnablementSnapshotRow } from '@/lib/seo/snapshots/types'

export async function loadSeoEnablementSnapshot(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoEnablementSnapshotRow | null> {
  const { data, error } = await fromBase(admin, 'seo_enablement_snapshot')
    .select(
      'id, coverage_pct, effective_missing_valid, duplicate_canonical_clusters, published_active_inventory, seo_gate_passed, updated_at'
    )
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as SeoEnablementSnapshotRow | null) ?? null
}

export function snapshotAgeMinutes(updatedAt: string | null | undefined, now = Date.now()): number | null {
  if (!updatedAt) return null
  const ms = now - new Date(updatedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.round(ms / 60_000)
}

export function isEnablementSnapshotFresh(
  updatedAt: string | null | undefined,
  now = Date.now(),
  maxAgeMs: number
): boolean {
  if (!updatedAt) return false
  const ageMs = now - new Date(updatedAt).getTime()
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs
}
