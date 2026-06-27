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
  countGeographyQualifiedOverrides,
  loadAllSeoMetroGeography,
} from '@/lib/seo/snapshots/loadSeoMetroGeography'
import {
  countSeoSitemapInventory,
  loadLatestSeoSitemapInventoryUpdatedAt,
} from '@/lib/seo/snapshots/loadSeoSitemapInventory'
import type { SeoInfrastructureDiagnostics } from '@/lib/seo/snapshots/types'
import {
  countSeoMetroInventory,
  loadLatestSeoMetroInventoryUpdatedAt,
} from '@/lib/seo/snapshots/loadSeoMetroInventory'

export async function loadSeoInfrastructureDiagnostics(
  admin = getAdminDb(),
  now = Date.now()
): Promise<SeoInfrastructureDiagnostics> {
  try {
    const [
      enablement,
      qualifiedMetroCount,
      inventoryCount,
      metroInventoryCount,
      qualifiedMetroUpdatedAt,
      inventoryUpdatedAt,
      metroInventoryUpdatedAt,
      geographyRows,
      geographyOverrideCount,
    ] = await Promise.all([
      loadSeoEnablementSnapshot(admin),
      countQualifiedSeoMetros(admin),
      countSeoSitemapInventory(admin),
      countSeoMetroInventory(admin),
      loadLatestQualifiedMetroSnapshotUpdatedAt(admin),
      loadLatestSeoSitemapInventoryUpdatedAt(admin),
      loadLatestSeoMetroInventoryUpdatedAt(admin),
      loadAllSeoMetroGeography(admin),
      countGeographyQualifiedOverrides(admin),
    ])

    return {
      enablementSnapshotAgeMinutes: snapshotAgeMinutes(enablement?.updated_at, now),
      qualifiedMetroSnapshotAgeMinutes: snapshotAgeMinutes(qualifiedMetroUpdatedAt, now),
      inventorySnapshotAgeMinutes: snapshotAgeMinutes(inventoryUpdatedAt, now),
      metroInventorySnapshotAgeMinutes: snapshotAgeMinutes(metroInventoryUpdatedAt, now),
      qualifiedMetroCount,
      sitemapInventoryCount: inventoryCount,
      metroInventoryCount,
      metroGeographyCount: geographyRows.length,
      geographyOverrideCount,
    }
  } catch {
    return {
      enablementSnapshotAgeMinutes: null,
      qualifiedMetroSnapshotAgeMinutes: null,
      inventorySnapshotAgeMinutes: null,
      metroInventorySnapshotAgeMinutes: null,
      qualifiedMetroCount: 0,
      sitemapInventoryCount: 0,
      metroInventoryCount: 0,
      metroGeographyCount: 0,
      geographyOverrideCount: 0,
    }
  }
}
