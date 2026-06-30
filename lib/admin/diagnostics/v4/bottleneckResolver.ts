import {
  HOT_PATH_OLDEST_AGE_MS,
  HOT_PATH_QUEUE_MIN,
  INSUFFICIENT_DRAIN_QUEUE_MIN,
} from '@/lib/admin/diagnostics/v4/constants'
import {
  buildBacklogSnapshot,
  buildDuplicateHealthSnapshot,
  buildVisibilitySnapshot,
  exceedsVisibleDuplicateThreshold,
} from '@/lib/admin/diagnostics/v4/buildDomainSnapshots'
import type {
  BottleneckType,
  ResolvedBottleneck,
  SecondaryPressure,
  SloEvaluationRow,
} from '@/lib/admin/diagnostics/v4/types'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function formatBottleneckLabel(id: string): string {
  switch (id) {
    case 'fetch':
      return 'Discovery / crawl'
    case 'geocode':
      return 'Geocoding'
    case 'publish':
      return 'Publishing'
    case 'address_enrichment':
      return 'Address enrichment'
    case 'catalog_repair':
      return 'Catalog repair'
    case 'visibility':
      return 'Visibility reconciliation'
    case 'duplicates':
      return 'Duplicate health'
    case 'refresh_stale':
      return 'Refresh stale'
    case 'db_provider_pressure':
      return 'Database / provider pressure'
    default:
      return id.replace(/_/g, ' ')
  }
}

function bottleneckTypeForId(id: string): BottleneckType {
  switch (id) {
    case 'fetch':
    case 'geocode':
    case 'publish':
    case 'address_enrichment':
      return 'HOT_PATH_BLOCKER'
    case 'catalog_repair':
    case 'refresh_stale':
    case 'missing_ingest':
      return 'BACKLOG_PRESSURE'
    case 'visibility_failure':
      return 'VISIBILITY_RECONCILIATION'
    case 'duplicate_health':
    case 'duplicate_canonical_clusters':
      return 'DUPLICATE_REVIEW'
    case 'parser_success_24h':
    case 'publish_failed_terminal':
      return 'HOT_PATH_BLOCKER'
    default:
      return 'UNKNOWN'
  }
}

type QueueCandidate = {
  id: string
  label: string
  domain: ResolvedBottleneck['domain']
  count: number
  oldestAgeMs: number | null
}

function queueCandidates(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): QueueCandidate[] {
  const backlogs = buildBacklogSnapshot(metrics, coverage)
  const candidates: QueueCandidate[] = [
    {
      id: 'catalog_repair',
      label: 'Catalog repair',
      domain: 'catalog_repair',
      count: backlogs.catalogRepair,
      oldestAgeMs: null,
    },
    {
      id: 'address_enrichment',
      label: 'Address enrichment',
      domain: 'catalog_repair',
      count: backlogs.addressEnrichment,
      oldestAgeMs: null,
    },
    {
      id: 'geocode',
      label: 'Geocoding',
      domain: 'geocoding',
      count: backlogs.geocodeEligible,
      oldestAgeMs: metrics.volume.geocode.oldestNeedsGeocodeAgeMs,
    },
    {
      id: 'publish',
      label: 'Publishing',
      domain: 'publishing',
      count: metrics.volume.publish.readyCount,
      oldestAgeMs: metrics.volume.publish.oldestReadyAgeMs,
    },
    {
      id: 'missing_ingest',
      label: 'Missing ingest',
      domain: 'visibility_coverage',
      count: backlogs.missingIngest,
      oldestAgeMs: null,
    },
    {
      id: 'refresh_stale',
      label: 'Refresh stale',
      domain: 'backlog_queues',
      count: backlogs.refreshStale,
      oldestAgeMs: null,
    },
  ]
  return candidates.filter((row) => row.count > 0)
}

function hasInsufficientDrain(count: number, metrics: IngestionMetricsResponse): boolean {
  if (count < INSUFFICIENT_DRAIN_QUEUE_MIN) return false
  const published24h = metrics.published24h
  const repairDrainProxy = metrics.funnel['24h'].stages.find((s) => s.id === 'published')?.count ?? 0
  return count >= INSUFFICIENT_DRAIN_QUEUE_MIN && repairDrainProxy <= published24h
}

function withType(
  partial: Omit<ResolvedBottleneck, 'type' | 'secondaryPressures'>,
  secondaryPressures: SecondaryPressure[] = []
): ResolvedBottleneck {
  return {
    ...partial,
    type: bottleneckTypeForId(partial.id),
    secondaryPressures,
  }
}

function buildSecondaryPressures(
  queues: QueueCandidate[],
  excludeId: string
): SecondaryPressure[] {
  return queues
    .filter((q) => q.id !== excludeId)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((q) => ({ id: q.id, label: q.label, count: q.count }))
}

function blockingSloBottleneck(
  blocking: readonly SloEvaluationRow[],
  secondaryPressures: SecondaryPressure[]
): ResolvedBottleneck | null {
  const first = blocking[0]
  if (!first) return null
  const domainMap: Record<string, ResolvedBottleneck['domain']> = {
    duplicate_canonical_clusters: 'duplicate_detection',
    parser_success_24h: 'parsing',
    publish_failed_terminal: 'publishing',
  }
  return withType(
    {
      id: first.id,
      label: first.label,
      reason: `Blocking SLO failure: ${first.label}`,
      domain: domainMap[first.id] ?? 'system_health',
      rawBottleneck: first.id,
    },
    secondaryPressures
  )
}

function resolveHotPathBlocker(
  metrics: IngestionMetricsResponse,
  secondaryPressures: SecondaryPressure[]
): ResolvedBottleneck | null {
  const geocodeEligible = metrics.geocodeEligibleBacklog
  const publishReady = metrics.volume.publish.readyCount
  const oldestGeocode = metrics.volume.geocode.oldestNeedsGeocodeAgeMs ?? 0
  const oldestPublish = metrics.volume.publish.oldestReadyAgeMs ?? 0

  if (
    geocodeEligible >= HOT_PATH_QUEUE_MIN &&
    (oldestGeocode >= HOT_PATH_OLDEST_AGE_MS || publishReady > 0)
  ) {
    return withType(
      {
        id: 'geocode',
        label: 'Geocoding',
        reason: `Geocode backlog blocking path (${geocodeEligible.toLocaleString()} eligible)`,
        domain: 'geocoding',
        rawBottleneck: metrics.volume.bottleneck,
      },
      secondaryPressures
    )
  }

  if (publishReady >= HOT_PATH_QUEUE_MIN && oldestPublish >= HOT_PATH_OLDEST_AGE_MS) {
    return withType(
      {
        id: 'publish',
        label: 'Publishing',
        reason: `Aged publish-ready queue (${publishReady.toLocaleString()} rows)`,
        domain: 'publishing',
        rawBottleneck: metrics.volume.bottleneck,
      },
      secondaryPressures
    )
  }

  const discovered =
    metrics.funnel['24h'].stages.find((s) => s.id === 'discovered')?.count ?? 0
  const inserted = metrics.funnel['24h'].stages.find((s) => s.id === 'inserted')?.count ?? 0
  const insertYield = metrics.volume.fetch.insertYield24h ?? metrics.volume.acquisition?.insertYield24h
  if (
    metrics.volume.bottleneck === 'fetch' &&
    discovered >= 500 &&
    inserted < 10 &&
    (insertYield ?? 1) < 0.01
  ) {
    return withType(
      {
        id: 'fetch',
        label: 'Discovery / crawl',
        reason: 'Low insert yield despite high discovery volume',
        domain: 'discovery',
        rawBottleneck: 'fetch',
      },
      secondaryPressures
    )
  }

  return null
}

export function resolvePrimaryBottleneck(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  blockingSloFailures: readonly SloEvaluationRow[]
): ResolvedBottleneck {
  const queues = queueCandidates(metrics, coverage)
  const secondaryAll = buildSecondaryPressures(queues, '')

  const blocking = blockingSloBottleneck(blockingSloFailures, secondaryAll)
  if (blocking) return blocking

  const hotPath = resolveHotPathBlocker(metrics, secondaryAll)
  if (hotPath) return hotPath

  const agedQueues = queues
    .filter((q) => hasInsufficientDrain(q.count, metrics))
    .sort((a, b) => {
      const ageA = a.oldestAgeMs ?? a.count
      const ageB = b.oldestAgeMs ?? b.count
      return ageB - ageA
    })
  const topQueue = agedQueues[0]
  if (topQueue) {
    return withType(
      {
        id: topQueue.id,
        label: topQueue.label,
        reason: `Largest aged queue with insufficient drain (${topQueue.count.toLocaleString()} rows)`,
        domain: topQueue.domain,
        rawBottleneck: metrics.volume.bottleneck,
      },
      buildSecondaryPressures(queues, topQueue.id)
    )
  }

  const visibility = buildVisibilitySnapshot(metrics, coverage)
  if (visibility.trueVisibilityFailureCount > 0 && visibility.classificationConfidence !== 'LOW') {
    return withType(
      {
        id: 'visibility_failure',
        label: 'True visibility failures',
        reason: `${visibility.trueVisibilityFailureCount.toLocaleString()} true visibility failure(s)`,
        domain: 'visibility_coverage',
        rawBottleneck: metrics.volume.bottleneck,
      },
      secondaryAll
    )
  }

  const duplicates = buildDuplicateHealthSnapshot(coverage)
  if (
    duplicates.canonicalPublishClusters > 0 ||
    exceedsVisibleDuplicateThreshold(duplicates.visibleDuplicateRate)
  ) {
    return withType(
      {
        id: 'duplicate_health',
        label: 'Duplicate health',
        reason:
          duplicates.canonicalPublishClusters > 0
            ? `${duplicates.canonicalPublishClusters} canonical publish cluster(s)`
            : `Visible duplicate rate ${((duplicates.visibleDuplicateRate ?? 0) * 100).toFixed(2)}%`,
        domain: 'duplicate_detection',
        rawBottleneck: metrics.volume.bottleneck,
      },
      secondaryAll
    )
  }

  const raw = metrics.volume.bottleneck
  return withType(
    {
      id: raw,
      label: formatBottleneckLabel(raw),
      reason: 'Fallback volume bottleneck classifier (legacy reference)',
      domain:
        raw === 'fetch'
          ? 'discovery'
          : raw === 'geocode'
            ? 'geocoding'
            : raw === 'publish'
              ? 'publishing'
              : raw === 'discovery'
                ? 'discovery'
                : raw === 'reconciliation'
                  ? 'visibility_coverage'
                  : raw === 'db_provider_pressure'
                    ? 'external_providers'
                    : 'pipeline',
      rawBottleneck: raw,
    },
    secondaryAll
  )
}
