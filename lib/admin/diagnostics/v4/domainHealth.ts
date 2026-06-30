import {
  ACTIONABLE_MISSING_SLO_MAX,
  CANONICAL_KEY_COVERAGE_MIN_PCT,
  CATALOG_REPAIR_SLO_MAX,
  COVERAGE_SLO_MIN_PCT,
  PARSER_SUCCESS_MIN_RATE,
  VISIBLE_DUPLICATE_RATE_MAX,
} from '@/lib/admin/diagnostics/v4/constants'
import type {
  CatalogRepairSnapshot,
  ComputedAlert,
  DomainHealthRow,
  DuplicateHealthSnapshot,
  SchedulerCronRow,
  SloEvaluationRow,
  SystemHealthLevel,
  VisibilitySnapshot,
} from '@/lib/admin/diagnostics/v4/types'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function domainStatusFromAlerts(
  domainAlerts: readonly ComputedAlert[],
  sloFailures: readonly SloEvaluationRow[]
): SystemHealthLevel {
  if (domainAlerts.some((a) => a.severity === 'critical' && a.blockingUserImpact)) {
    return 'critical'
  }
  if (sloFailures.some((s) => s.blocking)) {
    return 'critical'
  }
  if (domainAlerts.some((a) => a.severity === 'warning') || sloFailures.length > 0) {
    return 'degraded'
  }
  if (domainAlerts.some((a) => a.severity === 'info')) {
    return 'degraded'
  }
  return 'healthy'
}

export function buildDomainHealth(input: {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  alerts: readonly ComputedAlert[]
  slos: readonly SloEvaluationRow[]
  catalogRepair: CatalogRepairSnapshot
  visibility: VisibilitySnapshot
  duplicates: DuplicateHealthSnapshot
  schedulerCrons: readonly SchedulerCronRow[]
  backlogs: { refreshStale: number; geocodeEligible: number }
}): DomainHealthRow[] {
  const { metrics, coverage, alerts, slos, catalogRepair, visibility, duplicates, schedulerCrons, backlogs } =
    input

  const failedSlos = slos.filter((s) => !s.pass)
  const df = metrics.funnel['24h'].detailFirst
  const parserRate =
    df.attempted >= 20 ? (df.providerGeocodeBypassRate ?? df.succeeded / df.attempted) : null

  return [
    {
      id: 'discovery',
      label: 'Discovery',
      domain: 'discovery',
      status: domainStatusFromAlerts(
        alerts.filter((a) => a.domain === 'discovery'),
        []
      ),
      primaryReason:
        alerts.find((a) => a.id === 'crawl_skip_suspicious_share')?.trigger ?? 'Discovery pipeline nominal',
      currentMetric: `${metrics.funnel['24h'].stages.find((s) => s.id === 'discovered')?.count ?? 0} discovered (24h)`,
      threshold: '—',
      owner: 'discovery ops',
      recommendedAction: 'Monitor crawl skip taxonomy; sample suspicious skips if elevated.',
    },
    {
      id: 'parsing',
      label: 'Parsing',
      domain: 'parsing',
      status: domainStatusFromAlerts(
        alerts.filter((a) => a.domain === 'parsing'),
        failedSlos.filter((s) => s.id === 'parser_success_24h')
      ),
      primaryReason: slos.find((s) => s.id === 'parser_success_24h' && !s.pass)
        ? 'Parser success below SLO'
        : 'Parser healthy',
      currentMetric:
        parserRate != null ? `${(parserRate * 100).toFixed(1)}% success` : metrics.detailFirstProof.status,
      threshold: `≥${(PARSER_SUCCESS_MIN_RATE * 100).toFixed(0)}%`,
      owner: 'parser',
      recommendedAction: 'Review detail-first fallback reasons if degraded.',
    },
    {
      id: 'geocoding',
      label: 'Geocoding',
      domain: 'geocoding',
      status: backlogs.geocodeEligible > 0 ? 'degraded' : 'healthy',
      primaryReason:
        backlogs.geocodeEligible > 0
          ? `${backlogs.geocodeEligible} geocode-eligible row(s)`
          : 'No geocode backlog',
      currentMetric: backlogs.geocodeEligible.toLocaleString(),
      threshold: '0 eligible backlog (steady state)',
      owner: 'geocode cron',
      recommendedAction: 'Let geocode cron drain; check provider pressure if elevated.',
    },
    {
      id: 'publishing',
      label: 'Publishing',
      domain: 'publishing',
      status: domainStatusFromAlerts(
        alerts.filter((a) => a.domain === 'publishing'),
        failedSlos.filter((s) => s.id === 'publish_failed_terminal')
      ),
      primaryReason:
        slos.find((s) => s.id === 'publish_failed_terminal' && !s.pass)?.label ??
        `${metrics.failureBreakdown.publish_failed} terminal publish_failed`,
      currentMetric: `${metrics.published24h} published (24h)`,
      threshold: 'publish_failed within terminal SLO',
      owner: 'publish worker',
      recommendedAction: 'Triage terminal publish_failed; do not force-publish.',
    },
    {
      id: 'catalog_repair',
      label: 'Catalog Repair',
      domain: 'catalog_repair',
      status: domainStatusFromAlerts(
        alerts.filter((a) => a.domain === 'catalog_repair'),
        failedSlos.filter((s) => s.id === 'catalog_repair_queue')
      ),
      primaryReason:
        catalogRepair.queueTotal >= CATALOG_REPAIR_SLO_MAX
          ? `Repair queue ${catalogRepair.queueTotal} at/above SLO`
          : catalogRepair.dominantBlocker ?? 'Queue within SLO',
      currentMetric: `${catalogRepair.queueTotal} queue · ${catalogRepair.needsCheck} needs_check`,
      threshold: `<${CATALOG_REPAIR_SLO_MAX}`,
      owner: 'catalog-repair cron',
      recommendedAction: catalogRepair.recommendation,
    },
    {
      id: 'visibility',
      label: 'Visibility',
      domain: 'visibility_coverage',
      status: domainStatusFromAlerts(
        alerts.filter(
          (a) =>
            a.domain === 'visibility_coverage' &&
            (a.id.includes('visibility') || a.id.includes('observation'))
        ),
        []
      ),
      primaryReason:
        visibility.classificationMode === 'SAMPLE_ONLY'
          ? `Sample audit ${visibility.auditedCount}/${visibility.publishedNotVisibleTotal} (${visibility.classificationConfidence} confidence)`
          : `${visibility.publishedNotVisibleTotal} published_not_visible bucket`,
      currentMetric: `${visibility.trueVisibilityFailureCount} true failure · ${visibility.observationStaleCount} obs stale`,
      threshold: '—',
      owner: 'observation refresh',
      recommendedAction: 'Reconcile visibility; no blind republish.',
    },
    {
      id: 'coverage',
      label: 'Coverage',
      domain: 'visibility_coverage',
      status: domainStatusFromAlerts(
        alerts.filter((a) => a.id.startsWith('slo_coverage') || a.id.startsWith('slo_actionable')),
        failedSlos.filter((s) => s.id === 'coverage_pct' || s.id === 'actionable_missing_valid')
      ),
      primaryReason: slos.find((s) => s.id === 'coverage_pct' && !s.pass)
        ? 'Coverage below SLO'
        : `${coverage?.coveragePct?.toFixed(1) ?? '—'}% coverage`,
      currentMetric: `${coverage?.actionableMissingValid?.effectiveMissingValidYstmUrls ?? '—'} effective missing`,
      threshold: `≥${COVERAGE_SLO_MIN_PCT}% · actionable ≤${ACTIONABLE_MISSING_SLO_MAX}`,
      owner: 'coverage audit',
      recommendedAction: 'Drive false-exclusion buckets; re-run coverage audit.',
    },
    {
      id: 'duplicate_detection',
      label: 'Duplicate Detection',
      domain: 'duplicate_detection',
      status: domainStatusFromAlerts(
        alerts.filter((a) => a.domain === 'duplicate_detection'),
        failedSlos.filter((s) => s.id === 'duplicate_canonical_clusters')
      ),
      primaryReason:
        duplicates.canonicalPublishClusters > 0
          ? `${duplicates.canonicalPublishClusters} canonical cluster(s)`
          : duplicates.visibleDuplicateRate != null &&
              duplicates.visibleDuplicateRate >= VISIBLE_DUPLICATE_RATE_MAX
            ? `Visible duplicate rate ${(duplicates.visibleDuplicateRate * 100).toFixed(2)}%`
            : 'Within tolerance',
      currentMetric: `${duplicates.canonicalPublishClusters} canonical · ${duplicates.visibleDuplicateClusters} visible clusters`,
      threshold: `canonical = 0 · visible rate <${(VISIBLE_DUPLICATE_RATE_MAX * 100).toFixed(2)}%`,
      owner: 'manual review',
      recommendedAction: 'Review clusters before enforcement.',
    },
    {
      id: 'scheduler',
      label: 'Scheduler',
      domain: 'scheduler_cron',
      status: schedulerCrons.some((c) => c.state === 'crash_loop' || c.state === 'failed')
        ? 'critical'
        : schedulerCrons.some((c) => c.state === 'late')
          ? 'degraded'
          : schedulerCrons.filter((c) => c.state === 'unknown').length > 4
            ? 'degraded'
            : 'healthy',
      primaryReason:
        schedulerCrons.find((c) => c.state === 'crash_loop')?.displayName ??
        schedulerCrons.find((c) => c.state === 'late')?.displayName ??
        'Crons reporting OK or telemetry pending',
      currentMetric: `${schedulerCrons.filter((c) => c.state === 'ok').length}/${schedulerCrons.length} ok`,
      threshold: 'User-path crons within cadence',
      owner: 'ingestion ops',
      recommendedAction: 'Check late crons; investigate crash loops immediately.',
    },
    {
      id: 'external_providers',
      label: 'External Providers',
      domain: 'external_providers',
      status:
        metrics.volume.geocode.rate429Count24h > 10 || metrics.volume.bottleneck === 'db_provider_pressure'
          ? 'degraded'
          : 'healthy',
      primaryReason:
        metrics.volume.bottleneck === 'db_provider_pressure'
          ? 'Database/provider pressure'
          : `${metrics.volume.geocode.rate429Count24h} geocode 429s (24h)`,
      currentMetric: metrics.volume.bottleneck,
      threshold: 'normal provider pressure',
      owner: 'ingestion ops',
      recommendedAction: 'Backoff geocode concurrency if 429s elevated.',
    },
    {
      id: 'data_quality',
      label: 'Data Quality',
      domain: 'data_quality',
      status: domainStatusFromAlerts(
        alerts.filter((a) => a.domain === 'data_quality'),
        failedSlos.filter((s) => s.id === 'canonical_key_coverage')
      ),
      primaryReason:
        slos.find((s) => s.id === 'canonical_key_coverage' && !s.pass)?.label ?? 'Canonical key coverage',
      currentMetric: `${coverage?.canonicalSaleInstance.canonicalCoveragePct?.toFixed(1) ?? '—'}%`,
      threshold: `≥${CANONICAL_KEY_COVERAGE_MIN_PCT}%`,
      owner: 'canonical backfill',
      recommendedAction: 'Run canonical backfill when duplicate clusters = 0.',
    },
  ]
}
