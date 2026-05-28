import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { isPostgrestMissingModerationStatusColumn } from '@/lib/sales/isPostgrestMissingModerationStatusColumn'
import type { SeoPilotMetro } from '@/lib/seo/types'
import type { SeoInventorySummary } from '@/lib/seo/types'
import type { Sale } from '@/lib/types'

export type MetroInventoryResult = {
  sales: Sale[]
  summary: SeoInventorySummary
}

function buildInventorySummary(sales: Sale[]): SeoInventorySummary {
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

/**
 * Published sales for a pilot metro (city + state), for SSR city pages and qualification.
 */
export async function fetchMetroInventory(
  metro: SeoPilotMetro,
  options?: { limit?: number }
): Promise<MetroInventoryResult> {
  const limit = options?.limit ?? 100
  const admin = getAdminDb()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const runQuery = (includeModeration: boolean) =>
    applyPhase4PublicPublishedSaleReadFilters(
      fromBase(admin, 'sales_v2').select('*'),
      { includeModeration }
    )
      .ilike('city', metro.city)
      .eq('state', metro.state)
      .or(`date_end.gte.${todayStr},and(date_end.is.null,date_start.gte.${todayStr})`)
      .order('updated_at', { ascending: false })
      .limit(limit)

  let { data, error } = await runQuery(true)

  if (error && isPostgrestMissingModerationStatusColumn(error)) {
    const retry = await runQuery(false)
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('[SEO_METRO_INVENTORY] fetch failed:', metro.slug, error.message)
    return {
      sales: [],
      summary: { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
    }
  }

  const sales = (data ?? []) as Sale[]
  return { sales, summary: buildInventorySummary(sales) }
}
