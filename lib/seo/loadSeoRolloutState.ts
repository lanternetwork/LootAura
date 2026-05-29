import { cache } from 'react'
import { getAdminDb } from '@/lib/supabase/clients'
import { fetchSeoRolloutState, type SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutState'

/** Request-scoped SEO rollout state (fail-closed when DB/schema unavailable). */
export const getSeoRolloutStateForRequest = cache(async (): Promise<SeoRolloutRuntimeState> => {
  return fetchSeoRolloutState(getAdminDb())
})
