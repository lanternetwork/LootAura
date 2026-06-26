import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import type { SeoIndexGate, SeoIndexGateStatus } from '@/lib/seo/indexAllowlist'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'

export const SEO_ENABLEMENT_COVERAGE_MIN_PCT = 98
export const SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX = 50
export const SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN = 2000

export type SeoEnablementGateSnapshot = {
  generatedAt: string
  metricGatePass: boolean
  seoEmissionAllowed: boolean
  /** Panel state when metric gate + attestations pass. */
  readyForIndexing: boolean
  gates: SeoIndexGate[]
  blockers: string[]
}

function gate(
  id: string,
  label: string,
  status: SeoIndexGateStatus,
  detail: string
): SeoIndexGate {
  return { id, label, status, detail, source: 'seo_enablement' }
}

function attestationGate(
  id: string,
  label: string,
  pass: boolean,
  detailPass: string,
  detailFail: string
): SeoIndexGate {
  return gate(id, label, pass ? 'pass' : 'blocked', pass ? detailPass : detailFail)
}

/**
 * SEO_ENABLEMENT_GATE_V1 — decoupled from YSTM stabilization exit criteria.
 */
export function evaluateSeoEnablementMetricGate(
  coverage: YstmCoverageMetricsResponse | null
): Pick<SeoEnablementGateSnapshot, 'metricGatePass' | 'gates' | 'blockers'> {
  const gates: SeoIndexGate[] = []
  const blockers: string[] = []

  const duplicateClusters = coverage?.crossProviderConvergence?.duplicatePublishedCanonicalClusters ?? null
  const duplicateOk = duplicateClusters === 0
  gates.push(
    gate(
      'duplicate_published_canonical_clusters',
      'Duplicate published canonical clusters = 0',
      duplicateClusters == null ? 'pending' : duplicateOk ? 'pass' : 'fail',
      duplicateClusters == null ? 'Coverage unavailable' : String(duplicateClusters)
    )
  )
  if (!duplicateOk && duplicateClusters != null) {
    blockers.push('Duplicate published canonical clusters must be 0')
  }

  const coveragePct = coverage?.coveragePct ?? null
  const coverageOk = coveragePct != null && coveragePct >= SEO_ENABLEMENT_COVERAGE_MIN_PCT
  gates.push(
    gate(
      'coverage_pct',
      `Coverage ≥${SEO_ENABLEMENT_COVERAGE_MIN_PCT}%`,
      coveragePct == null ? 'pending' : coverageOk ? 'pass' : 'fail',
      coveragePct == null ? 'Coverage unavailable' : `${coveragePct.toFixed(1)}%`
    )
  )
  if (!coverageOk && coveragePct != null) {
    blockers.push(`Coverage must be ≥${SEO_ENABLEMENT_COVERAGE_MIN_PCT}%`)
  }

  const effectiveMissing = coverage?.actionableMissingValid?.effectiveMissingValidYstmUrls ?? null
  const effectiveOk =
    effectiveMissing != null && effectiveMissing <= SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX
  gates.push(
    gate(
      'effective_missing_valid',
      `Effective missing valid ≤${SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX}`,
      effectiveMissing == null ? 'pending' : effectiveOk ? 'pass' : 'fail',
      effectiveMissing == null ? 'Coverage unavailable' : effectiveMissing.toLocaleString()
    )
  )
  if (!effectiveOk && effectiveMissing != null) {
    blockers.push(`Effective missing valid must be ≤${SEO_ENABLEMENT_EFFECTIVE_MISSING_MAX}`)
  }

  const publishedActive = coverage?.publishedActiveLootAuraYstmUrls ?? null
  const publishedOk =
    publishedActive != null && publishedActive >= SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN
  gates.push(
    gate(
      'published_active_inventory',
      `Published active inventory ≥${SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN.toLocaleString()}`,
      publishedActive == null ? 'pending' : publishedOk ? 'pass' : 'fail',
      publishedActive == null ? 'Coverage unavailable' : publishedActive.toLocaleString()
    )
  )
  if (!publishedOk && publishedActive != null) {
    blockers.push(
      `Published active inventory must be ≥${SEO_ENABLEMENT_PUBLISHED_ACTIVE_MIN.toLocaleString()}`
    )
  }

  const metricGatePass =
    duplicateOk &&
    coverageOk &&
    effectiveOk &&
    publishedOk &&
    duplicateClusters != null &&
    coveragePct != null &&
    effectiveMissing != null &&
    publishedActive != null

  return { metricGatePass, gates, blockers }
}

export function evaluateSeoEnablementGate(
  coverage: YstmCoverageMetricsResponse | null,
  rolloutState: SeoRolloutRuntimeState
): SeoEnablementGateSnapshot {
  const metric = evaluateSeoEnablementMetricGate(coverage)
  const gates: SeoIndexGate[] = [...metric.gates]
  const blockers = [...metric.blockers]

  const publicIndexing = rolloutState.publicIndexingEnabled
  gates.push(
    attestationGate(
      'public_indexing_enabled',
      'Public indexing enabled (admin)',
      publicIndexing,
      rolloutState.publicIndexingEnabledAt
        ? `Enabled at ${rolloutState.publicIndexingEnabledAt}`
        : 'Admin opt-in enabled',
      'Not enabled — Phase 0 blocks public indexing and sitemap inclusion'
    )
  )
  if (!publicIndexing) {
    blockers.push('SEO public indexing is not enabled by admin (Phase 0)')
  }

  const crawlPass = rolloutState.crawlValidationPassed
  gates.push(
    attestationGate(
      'crawl_validation_passed',
      'Crawl validation attested',
      crawlPass,
      rolloutState.crawlValidationPassedAt
        ? `Attested at ${rolloutState.crawlValidationPassedAt}`
        : 'Admin attested',
      'Not attested — run crawl smoke and attest in admin'
    )
  )
  if (!crawlPass) {
    blockers.push('Crawl validation not attested (admin)')
  }

  const gscPass = rolloutState.searchConsoleValidationPassed
  gates.push(
    attestationGate(
      'search_console_validation_passed',
      'Search Console validation attested',
      gscPass,
      rolloutState.searchConsoleValidationPassedAt
        ? `Attested at ${rolloutState.searchConsoleValidationPassedAt}`
        : 'Admin attested',
      'Not attested — complete Search Console checklist in admin'
    )
  )
  if (!gscPass) {
    blockers.push('Search Console validation not attested (admin)')
  }

  const seoEmissionAllowed =
    metric.metricGatePass && publicIndexing && crawlPass && gscPass

  return {
    generatedAt: new Date().toISOString(),
    metricGatePass: metric.metricGatePass,
    seoEmissionAllowed,
    readyForIndexing: seoEmissionAllowed,
    gates,
    blockers: seoEmissionAllowed ? [] : [...new Set(blockers)],
  }
}
