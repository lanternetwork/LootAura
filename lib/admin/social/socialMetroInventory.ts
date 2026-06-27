import { countEstateSalesFromTitles } from '@/lib/admin/social/isEstateSaleTitle'
import type { SocialCityReportMapPin } from '@/lib/admin/social/socialCityReportTypes'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'
import { loadMetroInventoryFromSnapshot } from '@/lib/seo/snapshots/loadSeoMetroInventory'
import { loadSeoMetroGeographyBySlugs } from '@/lib/seo/snapshots/loadSeoMetroGeography'
import { getThisWeekendWindowInMetro, saleOverlapsDateRange } from '@/lib/seo/weekendBoundaries'
import type { Sale } from '@/lib/types'

export type SnapshotWeekendInventory = {
  pins: SocialCityReportMapPin[]
  activeSales: number
  estateSales: number
  yardSales: number
}

function salesToWeekendInventory(
  sales: Sale[],
  weekendStart: string,
  weekendEnd: string
): SnapshotWeekendInventory {
  const pins: SocialCityReportMapPin[] = []

  for (const sale of sales) {
    if (!saleOverlapsDateRange(sale, weekendStart, weekendEnd)) continue
    if (typeof sale.lat !== 'number' || typeof sale.lng !== 'number') continue
    pins.push({
      id: sale.id,
      lat: sale.lat,
      lng: sale.lng,
      title: sale.title?.trim() || 'Sale',
      is_featured: sale.is_featured === true,
    })
  }

  pins.sort((a, b) => a.id.localeCompare(b.id))

  const estateSales = countEstateSalesFromTitles(pins.map((pin) => pin.title))
  const activeSales = pins.length

  return {
    pins,
    activeSales,
    estateSales,
    yardSales: activeSales - estateSales,
  }
}

/** Snapshot-backed weekend inventory for social reports (no request-time geo or sales scans). */
export async function loadSocialWeekendInventoryFromSnapshot(
  metroSlug: string,
  timezone: string,
  now: Date = new Date()
): Promise<SnapshotWeekendInventory> {
  const weekend = getThisWeekendWindowInMetro(timezone, now)
  const { sales } = await loadMetroInventoryFromSnapshot(metroSlug, undefined, now)
  return salesToWeekendInventory(sales, weekend.start, weekend.end)
}

/** Snapshot-backed weekend counts for social ranking preset metros. */
export async function fetchPresetWeekendCountsBySlugFromSnapshot(
  now: Date = new Date()
): Promise<Record<string, number>> {
  const presetSlugs = listSocialReportRankingPresetSlugs()
  const geographyRows = await loadSeoMetroGeographyBySlugs(presetSlugs)
  const geographyBySlug = new Map(geographyRows.map((row) => [row.slug, row]))
  const countsBySlug: Record<string, number> = {}

  for (const slug of presetSlugs) {
    const geography = geographyBySlug.get(slug)
    if (!geography) {
      countsBySlug[slug] = 0
      continue
    }
    const inventory = await loadSocialWeekendInventoryFromSnapshot(
      slug,
      geography.timezone,
      now
    )
    countsBySlug[slug] = inventory.activeSales
  }

  return countsBySlug
}
