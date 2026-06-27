import { refreshSeoEnablementSnapshotCron } from '@/lib/seo/snapshots/buildSeoEnablementSnapshot'
import { refreshSeoMetroInventorySnapshotCron } from '@/lib/seo/snapshots/buildSeoMetroInventorySnapshot'
import { refreshSeoQualifiedMetrosSnapshotCron } from '@/lib/seo/snapshots/buildSeoQualifiedMetrosSnapshot'
import { refreshSeoSitemapInventorySnapshotCron } from '@/lib/seo/snapshots/buildSeoSitemapInventorySnapshot'
import { getAdminDb } from '@/lib/supabase/clients'

export type SeoSitemapSnapshotsCronResult = {
  ok: true
  job: 'seo_sitemap_snapshots'
  enablement: Awaited<ReturnType<typeof refreshSeoEnablementSnapshotCron>>
  qualifiedMetros: Awaited<ReturnType<typeof refreshSeoQualifiedMetrosSnapshotCron>>
  inventory: Awaited<ReturnType<typeof refreshSeoSitemapInventorySnapshotCron>>
  metroInventory: Awaited<ReturnType<typeof refreshSeoMetroInventorySnapshotCron>>
  completedAt: string
}

export async function runSeoSitemapSnapshotsCron(): Promise<SeoSitemapSnapshotsCronResult> {
  const admin = getAdminDb()
  const enablement = await refreshSeoEnablementSnapshotCron(admin)
  const [qualifiedMetros, inventory, metroInventory] = await Promise.all([
    refreshSeoQualifiedMetrosSnapshotCron(admin),
    refreshSeoSitemapInventorySnapshotCron(admin),
    refreshSeoMetroInventorySnapshotCron(admin),
  ])

  return {
    ok: true,
    job: 'seo_sitemap_snapshots',
    enablement,
    qualifiedMetros,
    inventory,
    metroInventory,
    completedAt: new Date().toISOString(),
  }
}
