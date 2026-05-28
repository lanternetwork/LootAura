import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateSeoIndexAllowlist, type SeoIndexGate } from '@/lib/seo/indexAllowlist'
import { isSeoPublicIndexingEnabled } from '@/lib/seo/constants'
import { qualifyAllPilotMetros } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoRobotsDirective } from '@/lib/seo/types'
export function isSeoCrawlValidationPassed(): boolean {
  return process.env.SEO_CRAWL_VALIDATION_PASSED === 'true'
}

export function isSeoSearchConsoleValidationPassed(): boolean {
  return process.env.SEO_SEARCH_CONSOLE_VALIDATION_PASSED === 'true'
}

/**
 * Runtime env attestation for indexable robots + sitemap (set after Phase 5 validation).
 * Operational allowlist must be green on the ingestion dashboard before enabling these env vars.
 */
export function isSeoIndexRolloutEnvReady(): boolean {
  return (
    isSeoPublicIndexingEnabled() &&
    isSeoCrawlValidationPassed() &&
    isSeoSearchConsoleValidationPassed()
  )
}

export function getSeoIndexPilotMetroSlugs(): string[] | null {
  const raw = process.env.SEO_INDEX_PILOT_METROS?.trim()
  if (!raw) return null
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isMetroAllowedForIndexRollout(metroSlug: string): boolean {
  const allowlist = getSeoIndexPilotMetroSlugs()
  if (!allowlist) return true
  return allowlist.includes(metroSlug)
}

export type SeoIndexRolloutSnapshot = {
  generatedAt: string
  indexingAllowed: boolean
  blockers: string[]
  gates: SeoIndexGate[]
  qualifiedPilotMetros: string[]
}

export function evaluateSeoIndexRolloutReadiness(options: {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  inventoryByMetroSlug?: Record<string, SeoInventorySummary>
}): SeoIndexRolloutSnapshot {
  const allowlist = evaluateSeoIndexAllowlist(options.metrics, options.coverage)
  const gates: SeoIndexGate[] = [...allowlist.gates]

  const crawlPass = isSeoCrawlValidationPassed()
  gates.push({
    id: 'crawl_validation',
    label: 'Crawl / HTML validation (Phase 5B)',
    status: crawlPass ? 'pass' : 'blocked',
    detail: crawlPass ? 'SEO_CRAWL_VALIDATION_PASSED=true' : 'Not attested — run crawl smoke',
    source: 'seo_kill_switch',
  })

  const gscPass = isSeoSearchConsoleValidationPassed()
  gates.push({
    id: 'search_console_validation',
    label: 'Search Console validation (Phase 5A)',
    status: gscPass ? 'pass' : 'blocked',
    detail: gscPass
      ? 'SEO_SEARCH_CONSOLE_VALIDATION_PASSED=true'
      : 'Not attested — complete Search Console checklist',
    source: 'seo_kill_switch',
  })

  const blockers = [...allowlist.blockers]
  if (!crawlPass) blockers.push('Crawl validation not attested (SEO_CRAWL_VALIDATION_PASSED)')
  if (!gscPass) blockers.push('Search Console validation not attested (SEO_SEARCH_CONSOLE_VALIDATION_PASSED)')

  const nationalIndexingAllowed =
    allowlist.indexingAllowed && crawlPass && gscPass

  const pilotMetros = qualifyAllPilotMetros({
    nationalIndexingAllowed,
    inventoryBySlug: options.inventoryByMetroSlug ?? {},
  })

  const pilotAllowlist = getSeoIndexPilotMetroSlugs()
  const qualifiedPilotMetros = pilotMetros
    .filter((m) => m.qualified && (!pilotAllowlist || pilotAllowlist.includes(m.slug)))
    .map((m) => m.slug)

  if (nationalIndexingAllowed && qualifiedPilotMetros.length === 0) {
    blockers.push('No pilot metros qualified for index rollout')
  }

  return {
    generatedAt: new Date().toISOString(),
    indexingAllowed: nationalIndexingAllowed && qualifiedPilotMetros.length > 0,
    blockers: [...new Set(blockers)],
    gates,
    qualifiedPilotMetros,
  }
}

export function resolveSeoRobotsDirective(options?: { metroSlug?: string }): SeoRobotsDirective {
  if (!isSeoIndexRolloutEnvReady()) {
    return { index: false, follow: true }
  }
  if (options?.metroSlug && !isMetroAllowedForIndexRollout(options.metroSlug)) {
    return { index: false, follow: true }
  }
  return { index: true, follow: true }
}

export function resolveListingIndexRobots(): SeoRobotsDirective {
  return resolveSeoRobotsDirective()
}

export function resolveMetroPageRobots(metroSlug: string): SeoRobotsDirective {
  return resolveSeoRobotsDirective({ metroSlug })
}
