import { evaluateSeoEnablementGateFromSnapshotFields } from '@/lib/seo/evaluateSeoEnablementGate'
import { requestCache } from '@/lib/seo/requestCache'
import { fetchSeoRolloutState } from '@/lib/seo/seoRolloutState'
import { buildMetricGateFieldsFromEnablementSnapshot } from '@/lib/seo/snapshots/coverageFromEnablementSnapshot'
import { SEO_SNAPSHOT_MAX_AGE_MS } from '@/lib/seo/snapshots/constants'
import {
  isEnablementSnapshotFresh,
  loadSeoEnablementSnapshot,
} from '@/lib/seo/snapshots/loadSeoEnablementSnapshot'
import { countGeographyQualifiedOverrides } from '@/lib/seo/snapshots/loadSeoMetroGeography'
import { countQualifiedSeoMetros } from '@/lib/seo/snapshots/loadSeoQualifiedMetros'
import { getAdminDb } from '@/lib/supabase/clients'

export type SitemapSeoGateState = {
  seoEmissionAllowed: boolean
  indexingAllowed: boolean
  snapshotFresh: boolean
  qualifiedMetroCount: number
}

const FAIL_CLOSED: SitemapSeoGateState = {
  seoEmissionAllowed: false,
  indexingAllowed: false,
  snapshotFresh: false,
  qualifiedMetroCount: 0,
}

/**
 * Lightweight sitemap SEO gate — reads precomputed snapshots + live attestations only.
 * Fail-closed when snapshots are missing or stale (>60min). No heavy analytics path.
 */
export const resolveSitemapSeoGate = requestCache(async (): Promise<SitemapSeoGateState> => {
  try {
    const admin = getAdminDb()
    const [snapshot, rolloutState, qualifiedMetroCount, geographyOverrideCount] = await Promise.all([
      loadSeoEnablementSnapshot(admin),
      fetchSeoRolloutState(admin),
      countQualifiedSeoMetros(admin),
      countGeographyQualifiedOverrides(admin),
    ])

    if (!snapshot || !isEnablementSnapshotFresh(snapshot.updated_at, Date.now(), SEO_SNAPSHOT_MAX_AGE_MS)) {
      return FAIL_CLOSED
    }

    const metricFields = buildMetricGateFieldsFromEnablementSnapshot(snapshot)
    const enablement = evaluateSeoEnablementGateFromSnapshotFields(metricFields, rolloutState)
    const seoEmissionAllowed = enablement.seoEmissionAllowed
    const indexingAllowed =
      seoEmissionAllowed && (qualifiedMetroCount >= 1 || geographyOverrideCount >= 1)

    return {
      seoEmissionAllowed,
      indexingAllowed,
      snapshotFresh: true,
      qualifiedMetroCount,
    }
  } catch {
    return FAIL_CLOSED
  }
})
