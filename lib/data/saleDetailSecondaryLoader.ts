import {
  getNearestSalesForSale,
  type NearestSalesCoords,
} from '@/lib/data/salesAccess'
import { getUserRatingForSeller } from '@/lib/data/ratingsAccess'
import type { Sale } from '@/lib/types'
import { requestCache } from '@/lib/seo/requestCache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type NearestSalesRequestKey = {
  saleId: string
  lat: number
  lng: number
  limit: number
}

/** Request-scoped nearest-sales load for deferred sale-detail boundaries (dedupes mobile + desktop). */
export const getNearestSalesForRequest = requestCache(
  async ({ saleId, lat, lng, limit }: NearestSalesRequestKey): Promise<Array<Sale & { distance_m: number }>> => {
    const supabase = await createSupabaseServerClient()
    const coords: NearestSalesCoords = { lat, lng }
    return getNearestSalesForSale(supabase, saleId, limit, coords).catch(() => [])
  }
)

type UserRatingRequestKey = {
  ownerId: string
  viewerUserId: string
}

/** Request-scoped viewer rating for deferred sale-detail seller activity. */
export const getUserRatingForSellerForRequest = requestCache(
  async ({ ownerId, viewerUserId }: UserRatingRequestKey): Promise<number | null> => {
    const supabase = await createSupabaseServerClient()
    return getUserRatingForSeller(supabase, ownerId, viewerUserId).catch(() => null)
  }
)
