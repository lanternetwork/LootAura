import { getAdminDb } from '@/lib/supabase/clients'
import { discoverSeoMetrosFromPublishedSales } from '@/lib/seo/metroCatalog'
import { fetchSeoRolloutState } from '@/lib/seo/seoRolloutState'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'
import { getInventorySeoEmissionForRequest } from '@/lib/seo/resolveInventorySeoEmission'
import { requestCache } from '@/lib/seo/requestCache'

/** Request-scoped SEO rollout state (fail-closed when DB/schema unavailable). */
export const getSeoRolloutStateForRequest = requestCache(async (): Promise<SeoRolloutRuntimeState> => {
  return fetchSeoRolloutState(getAdminDb())
})

/** Nationwide metros with published inventory footprint (request-scoped). */
export const getSeoMetrosForRequest = requestCache(async () => {
  return discoverSeoMetrosFromPublishedSales()
})

/**
 * Inventory SEO emission gate (R) for public pages.
 * @deprecated Prefer getInventorySeoEmissionForRequest — this returns R only.
 */
export const getSeoNationalIndexingAllowedForRequest = requestCache(async (): Promise<boolean> => {
  const emission = await getInventorySeoEmissionForRequest()
  return emission.indexingAllowed
})
