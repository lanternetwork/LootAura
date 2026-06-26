import { getAdminDb } from '@/lib/supabase/clients'
import {
  loadSeoEnablementSnapshot,
  snapshotAgeMinutes,
} from '@/lib/seo/snapshots/loadSeoEnablementSnapshot'
import {
  countQualifiedSeoMetros,
  loadLatestQualifiedMetroSnapshotUpdatedAt,
} from '@/lib/seo/snapshots/loadSeoQualifiedMetros'
import {
  countSeoSitemapInventory,
  loadLatestSeoSitemapInventoryUpdatedAt,
} from '@/lib/seo/snapshots/loadSeoSitemapInventory'
import type { SeoInfrastructureDiagnostics } from '@/lib/seo/snapshots/types'

export async function loadSeoInfrastructureDiagnostics(
  admin = getAdminDb(),
  now = Date.now()
): Promise<SeoInfrastructureDiagnostics> {
  try {
    const [
      enablement,
      qualifiedMetroCount,
      inventoryCount,
      qualifiedMetroUpdatedAt,
      inventoryUpdatedAt,
    ] = await Promise.all([
      loadSeoEnablementSnapshot(admin),
      countQualifiedSeoMetros(admin),
      countSeoSitemapInventory(admin),
      loadLatestQualifiedMetroSnapshotUpdatedAt(admin),
      loadLatestSeoSitemapInventoryUpdatedAt(admin),
    ])

    return {
      enablementSnapshotAgeMinutes: snapshotAgeMinutes(enablement?.updated_at, now),
      qualifiedMetroSnapshotAgeMinutes: snapshotAgeMinutes(qualifiedMetroUpdatedAt, now),
      inventorySnapshotAgeMinutes: snapshotAgeMinutes(inventoryUpdatedAt, now),
      qualifiedMetroCount,
      sitemapInventoryCount: inventoryCount,
    }
  } catch {
    return {
      enablementSnapshotAgeMinutes: null,
      qualifiedMetroSnapshotAgeMinutes: null,
      inventorySnapshotAgeMinutes: null,
      qualifiedMetroCount: 0,
      sitemapInventoryCount: 0,
    }
  }
}
