import { fetchMetroInventory } from '@/lib/seo/fetchMetroInventory'
import type { MetroInventoryResult } from '@/lib/seo/fetchMetroInventory'
import type { SeoPilotMetro } from '@/lib/seo/types'
import type { Sale } from '@/lib/types'
import {
  getThisWeekendWindowInMetro,
  saleOverlapsDateRange,
  type MetroWeekendWindow,
} from '@/lib/seo/weekendBoundaries'
import { buildInventorySummary } from '@/lib/seo/inventorySummary'

export type SaleFreshnessSignal = 'newly_added' | 'updated_recently' | 'active_this_weekend'

export type MetroWeekendInventoryResult = MetroInventoryResult & {
  weekend: MetroWeekendWindow
  freshnessBySaleId: Record<string, SaleFreshnessSignal[]>
}

const NEWLY_ADDED_MS = 7 * 24 * 60 * 60 * 1000
const UPDATED_RECENTLY_MS = 24 * 60 * 60 * 1000

export function getSaleFreshnessSignals(
  sale: Sale,
  nowMs: number = Date.now()
): SaleFreshnessSignal[] {
  const signals: SaleFreshnessSignal[] = ['active_this_weekend']
  const created = sale.created_at ? new Date(sale.created_at).getTime() : 0
  const updated = sale.updated_at ? new Date(sale.updated_at).getTime() : 0
  if (created && nowMs - created <= NEWLY_ADDED_MS) {
    signals.unshift('newly_added')
  }
  if (updated && nowMs - updated <= UPDATED_RECENTLY_MS) {
    signals.unshift('updated_recently')
  }
  return signals
}

export function formatFreshnessSignalLabel(signal: SaleFreshnessSignal): string {
  switch (signal) {
    case 'newly_added':
      return 'Newly added'
    case 'updated_recently':
      return 'Updated recently'
    case 'active_this_weekend':
      return 'Active this weekend'
    default:
      return signal
  }
}

export async function fetchMetroWeekendInventory(
  metro: SeoPilotMetro,
  options?: { limit?: number; now?: Date }
): Promise<MetroWeekendInventoryResult> {
  const now = options?.now ?? new Date()
  const weekend = getThisWeekendWindowInMetro(metro.timezone, now)
  const { sales: allSales } = await fetchMetroInventory(metro, options)

  const sales = allSales.filter((sale) =>
    saleOverlapsDateRange(sale, weekend.start, weekend.end)
  )

  const freshnessBySaleId: Record<string, SaleFreshnessSignal[]> = {}
  const nowMs = now.getTime()
  for (const sale of sales) {
    freshnessBySaleId[sale.id] = getSaleFreshnessSignals(sale, nowMs)
  }

  return {
    sales,
    summary: buildInventorySummary(sales),
    weekend,
    freshnessBySaleId,
  }
}
