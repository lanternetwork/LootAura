import type { SeoInventorySummary } from '@/lib/seo/types'
import type { Sale } from '@/lib/types'

export function buildInventorySummary(sales: Sale[]): SeoInventorySummary {
  const withCoords = sales.filter((s) => s.lat != null && s.lng != null)
  const crawlableInventoryPct = sales.length > 0 ? withCoords.length / sales.length : 0
  let lastUpdatedAt: string | null = null
  for (const sale of sales) {
    const candidate = sale.updated_at ?? sale.created_at
    if (candidate && (!lastUpdatedAt || candidate > lastUpdatedAt)) {
      lastUpdatedAt = candidate
    }
  }
  return {
    activeListingCount: sales.length,
    lastUpdatedAt,
    crawlableInventoryPct,
  }
}
