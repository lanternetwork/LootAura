import { cache } from 'react'
import { getAdminDb } from '@/lib/supabase/clients'
import { discoverSeoMetrosFromPublishedSales } from '@/lib/seo/metroCatalog'
import { fetchSeoRolloutState } from '@/lib/seo/seoRolloutState'
import { isSeoIndexRolloutReady, type SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'

/** Request-scoped SEO rollout state (fail-closed when DB/schema unavailable). */
export const getSeoRolloutStateForRequest = cache(async (): Promise<SeoRolloutRuntimeState> => {
  return fetchSeoRolloutState(getAdminDb())
})

/** Nationwide metros with published inventory footprint (request-scoped). */
export const getSeoMetrosForRequest = cache(async () => {
  return discoverSeoMetrosFromPublishedSales()
})

/**
 * National gate for per-metro robots on public pages.
 * Ops should only enable rollout attestations when ingestion allowlist is green on the dashboard.
 */
export const getSeoNationalIndexingAllowedForRequest = cache(async (): Promise<boolean> => {
  const rolloutState = await getSeoRolloutStateForRequest()
  return isSeoIndexRolloutReady(rolloutState)
})
