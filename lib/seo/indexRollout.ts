import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateSeoIndexAllowlist, type SeoIndexGate } from '@/lib/seo/indexAllowlist'
import { qualifyAllSeoMetros, qualifyMetroForSeoRollout } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoMetro, SeoRobotsDirective } from '@/lib/seo/types'
import {
  isSeoIndexRolloutReady,
  type SeoRolloutRuntimeState,
  SEO_ROLLOUT_DISABLED_STATE,
} from '@/lib/seo/seoRolloutState'

export { isSeoIndexRolloutReady } from '@/lib/seo/seoRolloutState'

export type SeoIndexRolloutSnapshot = {
  generatedAt: string
  indexingAllowed: boolean
  blockers: string[]
  gates: SeoIndexGate[]
  qualifiedMetroSlugs: string[]
  /** @deprecated use qualifiedMetroSlugs */
  qualifiedPilotMetros: string[]
  rolloutState: SeoRolloutRuntimeState
}

export function evaluateSeoIndexRolloutReadiness(options: {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  metros: SeoMetro[]
  inventoryByMetroSlug?: Record<string, SeoInventorySummary>
  rolloutState?: SeoRolloutRuntimeState
}): SeoIndexRolloutSnapshot {
  const rolloutState = options.rolloutState ?? SEO_ROLLOUT_DISABLED_STATE
  const allowlist = evaluateSeoIndexAllowlist(options.metrics, options.coverage, rolloutState)
  const gates: SeoIndexGate[] = [...allowlist.gates]

  const crawlPass = rolloutState.crawlValidationPassed
  gates.push({
    id: 'crawl_validation',
    label: 'Crawl / HTML validation (Phase 5B)',
    status: crawlPass ? 'pass' : 'blocked',
    detail: crawlPass
      ? rolloutState.crawlValidationPassedAt
        ? `Attested at ${rolloutState.crawlValidationPassedAt}`
        : 'Admin attested'
      : 'Not attested — run crawl smoke and attest in admin',
    source: 'seo_kill_switch',
  })

  const gscPass = rolloutState.searchConsoleValidationPassed
  gates.push({
    id: 'search_console_validation',
    label: 'Search Console validation (Phase 5A)',
    status: gscPass ? 'pass' : 'blocked',
    detail: gscPass
      ? rolloutState.searchConsoleValidationPassedAt
        ? `Attested at ${rolloutState.searchConsoleValidationPassedAt}`
        : 'Admin attested'
      : 'Not attested — complete Search Console checklist in admin',
    source: 'seo_kill_switch',
  })

  const blockers = [...allowlist.blockers]
  if (!crawlPass) blockers.push('Crawl validation not attested (admin)')
  if (!gscPass) blockers.push('Search Console validation not attested (admin)')

  const nationalIndexingAllowed =
    allowlist.indexingAllowed && crawlPass && gscPass

  const inventoryBySlug = options.inventoryByMetroSlug ?? {}
  const qualifiedMetros = qualifyAllSeoMetros({
    metros: options.metros,
    nationalIndexingAllowed,
    inventoryBySlug,
  })

  const qualifiedMetroSlugs = qualifiedMetros.filter((m) => m.qualified).map((m) => m.slug)

  if (nationalIndexingAllowed && qualifiedMetroSlugs.length === 0) {
    blockers.push('No metros qualified for index rollout (inventory thresholds)')
  }

  return {
    generatedAt: new Date().toISOString(),
    indexingAllowed: nationalIndexingAllowed && qualifiedMetroSlugs.length > 0,
    blockers: [...new Set(blockers)],
    gates,
    qualifiedMetroSlugs,
    qualifiedPilotMetros: qualifiedMetroSlugs,
    rolloutState,
  }
}

export function resolveListingIndexRobots(rolloutState: SeoRolloutRuntimeState): SeoRobotsDirective {
  if (!isSeoIndexRolloutReady(rolloutState)) {
    return { index: false, follow: true }
  }
  return { index: true, follow: true }
}

export function resolveMetroPageRobots(
  metro: SeoMetro,
  rolloutState: SeoRolloutRuntimeState,
  inventory: SeoInventorySummary,
  nationalIndexingAllowed: boolean
): SeoRobotsDirective {
  if (!isSeoIndexRolloutReady(rolloutState)) {
    return { index: false, follow: true }
  }
  const result = qualifyMetroForSeoRollout({
    metro,
    inventory,
    nationalIndexingAllowed,
  })
  return { index: result.qualified, follow: true }
}
