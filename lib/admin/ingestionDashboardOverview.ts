import type { IngestionFunnelStage, IngestionFunnelStageId } from '@/lib/admin/ingestionFunnelMetricsHelpers'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  evaluateYstmStabilizationExit,
  STABILIZATION_CATALOG_REPAIR_MAX,
  STABILIZATION_PUBLISH_FAILED_LOW_MAX,
} from '@/lib/admin/ystmStabilizationExitCriteria'
import {
  CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING,
  CRAWL_SKIP_TAXONOMY_MIN_SAMPLES,
} from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'
import { DETAIL_FIRST_SUCCESS_RATE_TARGET } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

/** Client-safe mirror of `YSTM_COVERAGE_TARGET_PCT` in ystmCoverageValidity.ts (avoid server import chain). */
const YSTM_COVERAGE_TARGET_PCT = 90

/** Tier 1 failures that require immediate intervention (Workstream H). */
const TIER1_BLOCKED_CRITERION_IDS = new Set(['duplicate_clusters', 'detail_first_proof'])

const GEOCODE_ELIGIBLE_LOW_THRESHOLD = 10
const CATALOG_REPAIR_BOTTLENECK_MIN = 50

export type IngestionDashboardMode = 'overview' | 'debug' | 'controls'

export type IngestionHealthState = 'healthy' | 'degraded' | 'blocked'

export type OperationalPriority = {
  severity: 'critical' | 'warning' | 'info'
  issue: string
  suggestedAction: string
}

export type QueueHealthSummary = {
  catalogRepair: number
  addressEnrichment: number
  geocodeBacklog: number
  geocodeEligible: number
  imageEnrichment: number
  missingIngest: number
  refreshStale: number
  publishFailed: number
  needsCheck: number
}

export type RuntimeStateLine = {
  label: string
  value: string
  tone: 'on' | 'off' | 'neutral' | 'warn'
}

export type FunnelSnapshot = {
  discovered: number
  inserted: number
  published: number
  publishFailed: number
  topDropoffLabel: string
  topDropoffCount: number
  insertYield24h: number | null
}

function stageCount(stages: IngestionFunnelStage[], id: IngestionFunnelStageId): number {
  return stages.find((s) => s.id === id)?.count ?? 0
}

function formatBottleneckLabel(bottleneck: string): string {
  switch (bottleneck) {
    case 'fetch':
      return 'Crawl / fetch'
    case 'geocode':
      return 'Geocode'
    case 'publish':
      return 'Publish'
    case 'address_enrichment':
      return 'Address enrichment'
    case 'db_provider_pressure':
      return 'Database / provider pressure'
    default:
      return bottleneck.replace(/_/g, ' ')
  }
}

export function buildFunnelSnapshot(metrics: IngestionMetricsResponse): FunnelSnapshot {
  const stages = metrics.funnel['24h'].stages
  const topDropoff = metrics.funnel['24h'].topDropoff
  return {
    discovered: stageCount(stages, 'discovered'),
    inserted: stageCount(stages, 'inserted'),
    published: stageCount(stages, 'published'),
    publishFailed: stageCount(stages, 'publish_failed'),
    topDropoffLabel: topDropoff
      ? `${topDropoff.fromStageId} → ${topDropoff.toStageId}`
      : '—',
    topDropoffCount: topDropoff?.count ?? 0,
    insertYield24h: metrics.volume.fetch.insertYield24h,
  }
}

export function buildQueueHealthSummary(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): QueueHealthSummary {
  return {
    catalogRepair: coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0,
    addressEnrichment: metrics.volume.addressLifecycle.enrichmentBacklog,
    geocodeBacklog: metrics.backlog,
    geocodeEligible: metrics.geocodeEligibleBacklog,
    imageEnrichment: metrics.volume.imageEnrichment.backlog,
    missingIngest:
      coverage?.pipelineBacklog.missingIngestionQueue ??
      coverage?.missingIngestion.missingQueueTotal ??
      0,
    refreshStale: coverage?.pipelineBacklog.existingRefreshStale ?? coverage?.existingRefresh.staleOver12h ?? 0,
    publishFailed: metrics.failureBreakdown.publish_failed,
    needsCheck: metrics.failureBreakdown.needs_check,
  }
}

export function buildRuntimeStateLines(
  coverage: YstmCoverageMetricsResponse | null
): RuntimeStateLine[] {
  if (!coverage) {
    return [
      {
        label: 'Coverage runtime',
        value: 'Unavailable (ystm-coverage fetch failed)',
        tone: 'warn',
      },
    ]
  }

  return [
    {
      label: 'Nationwide coverage bootstrap',
      value: coverage.coverageBootstrap.enabled ? 'Enabled' : 'Disabled',
      tone: coverage.coverageBootstrap.enabled ? 'on' : 'off',
    },
    {
      label: 'ES.net provider ingestion',
      value: coverage.esnetIngest.enabled ? 'Enabled' : 'Disabled',
      tone: coverage.esnetIngest.enabled ? 'on' : 'off',
    },
    {
      label: 'ES.net burst bootstrap',
      value: coverage.esnetBootstrap.enabled ? 'Enabled' : 'Disabled',
      tone: coverage.esnetBootstrap.enabled ? 'on' : 'off',
    },
    {
      label: 'Cross-provider convergence SLO',
      value:
        coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters === 0
          ? 'No duplicate canonical publish clusters'
          : `${coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters} duplicate cluster(s)`,
      tone:
        coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters === 0 ? 'on' : 'warn',
    },
  ]
}

export function isTier1InterventionRequired(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): boolean {
  const exit = evaluateYstmStabilizationExit(metrics, coverage)
  if (exit.tier1Criteria.some((c) => c.status === 'fail' && TIER1_BLOCKED_CRITERION_IDS.has(c.id))) {
    return true
  }
  if (metrics.failureBreakdown.publish_failed > STABILIZATION_PUBLISH_FAILED_LOW_MAX) {
    return true
  }
  const queues = buildQueueHealthSummary(metrics, coverage)
  if (queues.catalogRepair >= 200) return true
  return false
}

/**
 * Overview health (green / degraded / blocked) derived from Tier 1 stabilization exit criteria.
 */
export function deriveIngestionHealthState(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): IngestionHealthState {
  if (isTier1InterventionRequired(metrics, coverage)) {
    return 'blocked'
  }

  const exit = evaluateYstmStabilizationExit(metrics, coverage)
  if (exit.tier1Ready) {
    return 'healthy'
  }

  return 'degraded'
}

export function deriveEffectiveBottleneck(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): { id: string; label: string; rawBottleneck: string } {
  const queues = buildQueueHealthSummary(metrics, coverage)
  const rawBottleneck = metrics.volume.bottleneck

  if (queues.geocodeEligible <= GEOCODE_ELIGIBLE_LOW_THRESHOLD) {
    if (
      queues.catalogRepair >= CATALOG_REPAIR_BOTTLENECK_MIN &&
      queues.catalogRepair >= queues.addressEnrichment
    ) {
      return { id: 'catalog_repair', label: 'Catalog repair', rawBottleneck }
    }
    if (queues.addressEnrichment >= STABILIZATION_CATALOG_REPAIR_MAX) {
      return { id: 'address_enrichment', label: 'Address enrichment', rawBottleneck }
    }
    if (queues.catalogRepair >= STABILIZATION_CATALOG_REPAIR_MAX) {
      return { id: 'catalog_repair', label: 'Catalog repair', rawBottleneck }
    }
  }

  return { id: rawBottleneck, label: formatBottleneckLabel(rawBottleneck), rawBottleneck }
}

export function buildCoverageBootstrapAdvisories(
  coverage: YstmCoverageMetricsResponse | null
): string[] {
  if (!coverage?.coverageBootstrap.enabled) {
    return []
  }

  const advisories: string[] = []
  const trend = coverage.trend ?? []

  if (trend.length >= 2) {
    const last = trend[trend.length - 1]
    const prev = trend[trend.length - 2]
    const vDelta = last.validActiveYstmUrls - prev.validActiveYstmUrls
    if (
      vDelta > 0 &&
      last.coveragePct != null &&
      prev.coveragePct != null &&
      last.coveragePct < prev.coveragePct
    ) {
      advisories.push(
        `Coverage fell ${(prev.coveragePct - last.coveragePct).toFixed(1)} pp while audit denominator (V) grew by ${vDelta.toLocaleString()} — expected while nationwide bootstrap expands the footprint faster than repair reconciles.`
      )
    }
  }

  if (coverage.coveragePct != null && coverage.coveragePct < YSTM_COVERAGE_TARGET_PCT) {
    advisories.push(
      `Nationwide bootstrap is ON and coverage is below ${YSTM_COVERAGE_TARGET_PCT}% — drain catalog repair before chasing coverage % while V is still expanding.`
    )
  }

  return advisories
}

export function ingestionHealthDisplayLabel(health: IngestionHealthState): string {
  switch (health) {
    case 'healthy':
      return 'Green'
    case 'degraded':
      return 'Degraded'
    case 'blocked':
      return 'Blocked'
  }
}

export function buildOperationalPriorities(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): OperationalPriority[] {
  const priorities: OperationalPriority[] = []
  const queues = buildQueueHealthSummary(metrics, coverage)

  if (coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters) {
    priorities.push({
      severity: 'critical',
      issue: `${coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters} duplicate canonical publish cluster(s)`,
      suggestedAction:
        'Review convergence in Debug; remediate duplicate published sales before enforcing SLO.',
    })
  }

  if (metrics.detailFirstProof.status === 'fail') {
    priorities.push({
      severity: 'critical',
      issue: 'Detail-first post-deploy proof failed',
      suggestedAction:
        'Open Debug → Parser health; fix failing proof checks or reset baseline after deploy.',
    })
  }

  if (queues.publishFailed > 0) {
    priorities.push({
      severity: queues.publishFailed >= 50 ? 'critical' : 'warning',
      issue: `${queues.publishFailed.toLocaleString()} terminal publish_failed row(s)`,
      suggestedAction:
        'Check address enrichment and catalog repair; gated listings should defer, not loop publish_failed.',
    })
  }

  for (const advisory of buildCoverageBootstrapAdvisories(coverage)) {
    priorities.push({
      severity: 'warning',
      issue: advisory,
      suggestedAction: 'Track V vs visible in daily ops log; turn bootstrap OFF when repair < 100.',
    })
  }

  if (queues.catalogRepair >= 100) {
    priorities.push({
      severity: 'warning',
      issue: `Catalog repair queue elevated (${queues.catalogRepair.toLocaleString()})`,
      suggestedAction: 'Let repair cron run; inspect publish vs needs_check in Debug.',
    })
  }

  if (queues.addressEnrichment >= 100) {
    priorities.push({
      severity: 'warning',
      issue: `Address enrichment backlog (${queues.addressEnrichment.toLocaleString()})`,
      suggestedAction: 'Confirm address enrichment worker; listings may be gated until unlock.',
    })
  }

  const crawl = metrics.volume.fetch.crawlSkipTaxonomy24h
  if (crawl && crawl.total >= CRAWL_SKIP_TAXONOMY_MIN_SAMPLES) {
    const suspiciousShare = crawl.suspicious / crawl.total
    if (suspiciousShare >= CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING) {
      priorities.push({
        severity: 'warning',
        issue: `Suspicious crawl skips ${(suspiciousShare * 100).toFixed(1)}% of classified skips`,
        suggestedAction: 'Open Debug → Refresh health; review date-change suppressions.',
      })
    }
  }

  const df = metrics.funnel['24h'].detailFirst
  if (df.attempted >= 20) {
    const successRate = df.providerGeocodeBypassRate ?? df.succeeded / df.attempted
    if (successRate < DETAIL_FIRST_SUCCESS_RATE_TARGET) {
      priorities.push({
        severity: 'warning',
        issue: `Detail-first success rate ${(successRate * 100).toFixed(1)}% below target`,
        suggestedAction: 'Inspect Debug → Parser health and fallback reasons.',
      })
    }
  }

  if (coverage && coverage.missingValidYstmUrls > 0) {
    priorities.push({
      severity: 'info',
      issue: `${coverage.missingValidYstmUrls.toLocaleString()} valid audit URLs not visible on map`,
      suggestedAction: 'Run missing-url ingestion / coverage audit.',
    })
  }

  if (priorities.length === 0) {
    priorities.push({
      severity: 'info',
      issue: 'No elevated operational alerts',
      suggestedAction: 'Monitor queues; use Copy diagnostics before Debug.',
    })
  }

  return priorities.slice(0, 8)
}

export function coverageTrendSummary(coverage: YstmCoverageMetricsResponse | null): string {
  if (!coverage?.trend.length) return 'No audit trend yet'
  const last = coverage.trend[coverage.trend.length - 1]
  const prev = coverage.trend.length > 1 ? coverage.trend[coverage.trend.length - 2] : null
  if (last?.coveragePct == null) return '—'
  const pct = last.coveragePct
  if (prev?.coveragePct == null) {
    return `${pct.toFixed(1)}% (latest audit)`
  }
  const delta = pct - prev.coveragePct
  const sign = delta >= 0 ? '+' : ''
  return `${pct.toFixed(1)}% (${sign}${delta.toFixed(1)} pp vs prior audit)`
}

export function ingestionHealthSummary(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): {
  health: IngestionHealthState
  healthLabel: string
  tier1Ready: boolean
  interventionRequired: boolean
  bottleneck: string
  bottleneckLabel: string
  rawBottleneck: string
  coverageLine: string
  convergenceLine: string
  bootstrapAdvisories: string[]
} {
  const exit = evaluateYstmStabilizationExit(metrics, coverage)
  const effective = deriveEffectiveBottleneck(metrics, coverage)
  const health = deriveIngestionHealthState(metrics, coverage)

  return {
    health,
    healthLabel: ingestionHealthDisplayLabel(health),
    tier1Ready: exit.tier1Ready,
    interventionRequired: isTier1InterventionRequired(metrics, coverage),
    bottleneck: effective.id,
    bottleneckLabel: effective.label,
    rawBottleneck: effective.rawBottleneck,
    coverageLine: coverage
      ? `${coverage.coveragePct?.toFixed(1) ?? '—'}% coverage (V=${coverage.validActiveYstmUrls.toLocaleString()})`
      : 'Coverage data unavailable',
    convergenceLine: coverage
      ? coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters === 0
        ? 'Cross-provider convergence healthy'
        : `${coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters} duplicate canonical cluster(s)`
      : 'Convergence data unavailable',
    bootstrapAdvisories: buildCoverageBootstrapAdvisories(coverage),
  }
}
