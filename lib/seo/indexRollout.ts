import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateSeoEnablementGate } from '@/lib/seo/evaluateSeoEnablementGate'
import type { SeoIndexGate } from '@/lib/seo/indexAllowlist'
import { qualifyAllSeoMetros, qualifyMetroForSeoRollout } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoMetro, SeoRobotsDirective } from '@/lib/seo/types'
import { type SeoRolloutRuntimeState, SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutTypes'

export type SeoIndexRolloutSnapshot = {
  generatedAt: string
  /** National metrics + attestations (listings). */
  seoEmissionAllowed: boolean
  /** National emission + at least one qualified metro (geo sitemaps / metro pages). */
  indexingAllowed: boolean
  blockers: string[]
  gates: SeoIndexGate[]
  qualifiedMetroSlugs: string[]
  /** @deprecated use qualifiedMetroSlugs */
  qualifiedPilotMetros: string[]
  rolloutState: SeoRolloutRuntimeState
}

export function evaluateSeoIndexRolloutReadiness(options: {
  coverage: YstmCoverageMetricsResponse | null
  metros: SeoMetro[]
  inventoryByMetroSlug?: Record<string, SeoInventorySummary>
  rolloutState?: SeoRolloutRuntimeState
}): SeoIndexRolloutSnapshot {
  const rolloutState = options.rolloutState ?? SEO_ROLLOUT_DISABLED_STATE
  const enablement = evaluateSeoEnablementGate(options.coverage, rolloutState)
  const gates: SeoIndexGate[] = [...enablement.gates]
  const blockers = [...enablement.blockers]

  const inventoryBySlug = options.inventoryByMetroSlug ?? {}
  const qualifiedMetros = qualifyAllSeoMetros({
    metros: options.metros,
    nationalIndexingAllowed: enablement.seoEmissionAllowed,
    inventoryBySlug,
  })

  const qualifiedMetroSlugs = qualifiedMetros.filter((m) => m.qualified).map((m) => m.slug)

  if (enablement.seoEmissionAllowed && qualifiedMetroSlugs.length === 0) {
    blockers.push('No metros qualified for index rollout (inventory thresholds)')
  }

  const indexingAllowed = enablement.seoEmissionAllowed && qualifiedMetroSlugs.length > 0

  return {
    generatedAt: new Date().toISOString(),
    seoEmissionAllowed: enablement.seoEmissionAllowed,
    indexingAllowed,
    blockers: indexingAllowed ? [] : [...new Set(blockers)],
    gates,
    qualifiedMetroSlugs,
    qualifiedPilotMetros: qualifiedMetroSlugs,
    rolloutState,
  }
}

/** Listing robots — national SEO emission + per-sale eligibility at call site. */
export function resolveListingIndexRobots(seoEmissionAllowed: boolean): SeoRobotsDirective {
  if (!seoEmissionAllowed) {
    return { index: false, follow: true }
  }
  return { index: true, follow: true }
}

/**
 * Metro/weekend robots — national emission gate + per-metro qualification.
 */
export function resolveMetroPageRobots(
  metro: SeoMetro,
  inventory: SeoInventorySummary,
  seoEmissionAllowed: boolean
): SeoRobotsDirective {
  if (!seoEmissionAllowed) {
    return { index: false, follow: true }
  }
  const result = qualifyMetroForSeoRollout({
    metro,
    inventory,
    nationalIndexingAllowed: true,
  })
  return { index: result.qualified, follow: true }
}
