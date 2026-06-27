import { buildInventorySummary } from '@/lib/seo/inventorySummary'
import type { MetroInventoryResult } from '@/lib/seo/fetchMetroInventory'
import type { SeoMetro } from '@/lib/seo/types'
import {
  getSaleFreshnessSignals,
  type MetroWeekendInventoryResult,
  type SaleFreshnessSignal,
} from '@/lib/seo/fetchMetroWeekendInventory'
import {
  getThisWeekendWindowInMetro,
  saleOverlapsDateRange,
} from '@/lib/seo/weekendBoundaries'
import type { Sale } from '@/lib/types'

export function buildMetroWeekendInventory(
  metro: SeoMetro,
  sales: Sale[],
  now: Date = new Date()
): MetroWeekendInventoryResult {
  const weekend = getThisWeekendWindowInMetro(metro.timezone, now)
  const filtered = sales.filter((sale) => saleOverlapsDateRange(sale, weekend.start, weekend.end))

  const freshnessBySaleId: Record<string, SaleFreshnessSignal[]> = {}
  const nowMs = now.getTime()
  for (const sale of filtered) {
    freshnessBySaleId[sale.id] = getSaleFreshnessSignals(sale, nowMs)
  }

  return {
    sales: filtered,
    summary: buildInventorySummary(filtered),
    weekend,
    freshnessBySaleId,
  }
}

export function buildMetroWeekendInventoryFromResult(
  metro: SeoMetro,
  inventory: MetroInventoryResult,
  now?: Date
): MetroWeekendInventoryResult {
  return buildMetroWeekendInventory(metro, inventory.sales, now)
}
