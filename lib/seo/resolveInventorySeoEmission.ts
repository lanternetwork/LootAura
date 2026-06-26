import { buildSeoIngestionGateMetrics } from '@/lib/seo/buildSeoIngestionGateMetrics'
import { buildYstmCoverageScoreboard } from '@/lib/admin/ystmCoverageScoreboard'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { fetchNationwideSeoMetroInventory } from '@/lib/seo/fetchAllSeoMetroInventory'
import {
  evaluateSeoIndexRolloutReadiness,
  type SeoIndexRolloutSnapshot,
} from '@/lib/seo/indexRollout'
import { requestCache } from '@/lib/seo/requestCache'
import { fetchSeoRolloutState } from '@/lib/seo/seoRolloutState'
import { SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutTypes'
import { getAdminDb } from '@/lib/supabase/clients'

export type InventorySeoEmissionState = {
  /** National metrics + attestations (listing robots / listing sitemap). */
  seoEmissionAllowed: boolean
  /** National emission + qualified metros (geo sitemaps / metro robots). */
  indexingAllowed: boolean
  metricsAvailable: boolean
  rollout: SeoIndexRolloutSnapshot
}

const FAIL_CLOSED_ROLLOUT: SeoIndexRolloutSnapshot = {
  generatedAt: new Date(0).toISOString(),
  seoEmissionAllowed: false,
  indexingAllowed: false,
  blockers: ['SEO operational inputs unavailable'],
  gates: [],
  qualifiedMetroSlugs: [],
  qualifiedPilotMetros: [],
  rolloutState: SEO_ROLLOUT_DISABLED_STATE,
}

const FAIL_CLOSED: InventorySeoEmissionState = {
  seoEmissionAllowed: false,
  indexingAllowed: false,
  metricsAvailable: false,
  rollout: FAIL_CLOSED_ROLLOUT,
}

/**
 * Request-scoped inventory SEO emission gate (R).
 * Fail-closed when rollout state, metrics, or coverage cannot be evaluated.
 */
export const getInventorySeoEmissionForRequest = requestCache(
  async (): Promise<InventorySeoEmissionState> => {
    try {
      const admin = getAdminDb()
      const [rolloutState, metroSnapshot, metrics, coverageBoard] = await Promise.all([
        fetchSeoRolloutState(admin),
        fetchNationwideSeoMetroInventory(),
        buildSeoIngestionGateMetrics(),
        buildYstmCoverageScoreboard(admin),
      ])

      if (!metrics.ok) {
        return FAIL_CLOSED
      }

      const coverage: YstmCoverageMetricsResponse = { ok: true, ...coverageBoard }
      const rollout = evaluateSeoIndexRolloutReadiness({
        coverage,
        metros: metroSnapshot.metros,
        inventoryByMetroSlug: metroSnapshot.inventoryBySlug,
        rolloutState,
      })

      return {
        seoEmissionAllowed: rollout.seoEmissionAllowed,
        indexingAllowed: rollout.indexingAllowed,
        metricsAvailable: true,
        rollout,
      }
    } catch {
      return FAIL_CLOSED
    }
  }
)

/** @deprecated use getInventorySeoEmissionForRequest — kept for call-site migration clarity */
export const resolveInventorySeoEmissionAllowed = getInventorySeoEmissionForRequest
