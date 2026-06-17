import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import {
  buildQueueHealthSummary,
  deriveEffectiveBottleneck,
  ingestionHealthSummary,
} from '@/lib/admin/ingestionDashboardOverview'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateYstmStabilizationExit } from '@/lib/admin/ystmStabilizationExitCriteria'
import { DETAIL_FIRST_SUCCESS_RATE_TARGET } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

export type SystemAssessmentOverallState = 'HEALTHY' | 'PARTIALLY_HEALTHY' | 'DEGRADED'

export type SystemAssessmentBottleneck =
  | 'ADDRESS_ENRICHMENT'
  | 'CATALOG_REPAIR'
  | 'DISCOVERY'
  | 'PUBLISH_PIPELINE'
  | 'GEOCODE'
  | 'NONE'
  | 'UNKNOWN'

function mapOverallState(health: 'healthy' | 'degraded' | 'blocked'): SystemAssessmentOverallState {
  switch (health) {
    case 'healthy':
      return 'HEALTHY'
    case 'degraded':
      return 'PARTIALLY_HEALTHY'
    case 'blocked':
      return 'DEGRADED'
  }
}

function mapBottleneckId(id: string): SystemAssessmentBottleneck {
  switch (id) {
    case 'address_enrichment':
      return 'ADDRESS_ENRICHMENT'
    case 'catalog_repair':
      return 'CATALOG_REPAIR'
    case 'fetch':
      return 'DISCOVERY'
    case 'publish':
      return 'PUBLISH_PIPELINE'
    case 'geocode':
      return 'GEOCODE'
    case 'none':
      return 'NONE'
    default:
      return 'UNKNOWN'
  }
}

function deriveSecondaryBottleneck(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  primaryId: string
): SystemAssessmentBottleneck {
  const queues = buildQueueHealthSummary(metrics, coverage)
  const candidates: Array<{ id: string; count: number }> = [
    { id: 'catalog_repair', count: queues.catalogRepair },
    { id: 'address_enrichment', count: queues.addressEnrichment },
    { id: 'needs_check', count: queues.needsCheck },
    { id: 'missing_ingest', count: queues.missingIngest },
    { id: 'refresh_stale', count: queues.refreshStale },
    { id: 'geocode', count: queues.geocodeEligible },
  ]
    .filter((row) => row.id !== primaryId && row.count > 0)
    .sort((a, b) => b.count - a.count)

  if (candidates.length === 0) {
    const raw = metrics.volume.bottleneck
    if (raw && raw !== primaryId) {
      return mapBottleneckId(raw)
    }
    return 'NONE'
  }

  const top = candidates[0]!
  if (top.id === 'needs_check' || top.id === 'missing_ingest' || top.id === 'refresh_stale') {
    return top.id === 'needs_check' ? 'ADDRESS_ENRICHMENT' : 'CATALOG_REPAIR'
  }
  return mapBottleneckId(top.id)
}

function deriveParserState(metrics: IngestionMetricsResponse): string {
  const df = metrics.funnel['24h'].detailFirst
  if (metrics.detailFirstProof.status === 'fail') return 'FAIL'
  if (df.attempted >= 20) {
    const rate = df.providerGeocodeBypassRate ?? df.succeeded / df.attempted
    if (rate < DETAIL_FIRST_SUCCESS_RATE_TARGET) return 'DEGRADED'
  }
  if (df.operationalHealth.healthy) return 'HEALTHY'
  return 'DEGRADED'
}

function deriveDiscoveryState(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string {
  if (!coverage) return 'UNAVAILABLE'
  const run = coverage.graphEnumeration.lastDiscoveryRun
  if (run?.ok === false) return 'DEGRADED'
  if (coverage.graphEnumeration.throttleRecommended) return 'THROTTLED'
  const crawlable = metrics.volume.acquisition.crawlableConfigs
  if (crawlable >= 200) return 'HEALTHY'
  if (crawlable > 0) return 'PARTIAL'
  return 'LOW'
}

function derivePublishPathState(metrics: IngestionMetricsResponse): string {
  const published = metrics.funnel['24h'].stages.find((s) => s.id === 'published')?.count ?? 0
  const publishFailed = metrics.failureBreakdown.publish_failed
  if (metrics.detailFirstProof.status === 'fail') return 'BLOCKED'
  if (publishFailed > 50) return 'DEGRADED'
  if (published > 0 && publishFailed === 0) return 'HEALTHY'
  if (publishFailed > 0) return 'DEGRADED'
  return 'QUIET'
}

function deriveTier1StabilizationState(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): 'PASS' | 'FAIL' | 'BLOCKED' {
  const summary = ingestionHealthSummary(metrics, coverage)
  if (summary.interventionRequired) return 'BLOCKED'
  const exit = evaluateYstmStabilizationExit(metrics, coverage)
  return exit.tier1Ready ? 'PASS' : 'FAIL'
}

function deriveSeoReadinessState(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): 'PASS' | 'FAIL' | 'BLOCKED' {
  return deriveTier1StabilizationState(metrics, coverage)
}

export function buildIngestionSystemAssessmentDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string {
  const summary = ingestionHealthSummary(metrics, coverage)
  const effective = deriveEffectiveBottleneck(metrics, coverage)
  const primary = mapBottleneckId(effective.id)
  const secondary = deriveSecondaryBottleneck(metrics, coverage, effective.id)
  const exit = evaluateYstmStabilizationExit(metrics, coverage)
  const targetPct = coverage?.targetPct ?? 90

  const lines = [
    '## SYSTEM ASSESSMENT',
    diagnosticBullet('overall state', mapOverallState(summary.health)),
    diagnosticBullet('primary bottleneck', primary),
    diagnosticBullet('secondary bottleneck', secondary),
    diagnosticBullet('parser state', deriveParserState(metrics)),
    diagnosticBullet('discovery state', deriveDiscoveryState(metrics, coverage)),
    diagnosticBullet('publish path state', derivePublishPathState(metrics)),
    diagnosticBullet(
      'coverage status',
      coverage?.coveragePct != null
        ? coverage.coveragePct >= targetPct
          ? 'AT_TARGET'
          : 'BELOW_TARGET'
        : 'UNAVAILABLE'
    ),
    diagnosticBullet(
      'coverage percentage',
      coverage?.coveragePct != null ? `${coverage.coveragePct.toFixed(1)}%` : '—'
    ),
    diagnosticBullet('coverage target', `≥${targetPct}%`),
    diagnosticBullet('seo readiness', deriveSeoReadinessState(metrics, coverage)),
    diagnosticBullet('tier1 stabilization', deriveTier1StabilizationState(metrics, coverage)),
    diagnosticBullet(
      'tier1 criteria met',
      `${exit.tier1Criteria.filter((c) => c.status === 'pass').length}/${exit.tier1Criteria.length}`
    ),
  ]

  return lines.join('\n')
}
