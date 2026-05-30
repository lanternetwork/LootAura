import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { isPostgrestMissingModerationStatusColumn } from '@/lib/sales/isPostgrestMissingModerationStatusColumn'
import { buildInventorySummary } from '@/lib/seo/inventorySummary'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'
import type { Sale } from '@/lib/types'

export type MetroInventoryResult = {
  sales: Sale[]
  summary: SeoInventorySummary
}

/**
 * Published sales for a pilot metro (city + state), for SSR city pages and qualification.
 */
export async function fetchMetroInventory(
  metro: SeoMetro,
  options?: { limit?: number }
): Promise<MetroInventoryResult> {
  const limit = options?.limit ?? 100
  const admin = getAdminDb()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const runQuery = (includeModeration: boolean) =>
    applyPhase4PublicPublishedSaleReadFilters(
      fromBase(admin, T.sales).select('*'),
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
