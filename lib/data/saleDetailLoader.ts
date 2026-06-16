import { getSaleWithItems } from '@/lib/data/salesAccess'
import type { SaleWithOwnerInfo } from '@/lib/data/sales'
import type { SaleItem } from '@/lib/types'
import { requestCache } from '@/lib/seo/requestCache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type SaleWithItemsResult = {
  sale: SaleWithOwnerInfo
  items: SaleItem[]
}

/** Request-scoped sale + items load for /sales/[id] (metadata + page share one waterfall). */
export const getSaleWithItemsForRequest = requestCache(
  async (saleId: string): Promise<SaleWithItemsResult | null> => {
    const supabase = await createSupabaseServerClient()
    return getSaleWithItems(supabase, saleId)
  }
)
