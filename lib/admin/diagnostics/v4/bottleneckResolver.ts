import { INSUFFICIENT_DRAIN_QUEUE_MIN } from '@/lib/admin/diagnostics/v4/constants'
import {
  buildBacklogSnapshot,
  buildCatalogRepairSnapshot,
  buildDuplicateHealthSnapshot,
  buildVisibilitySnapshot,
  exceedsVisibleDuplicateThreshold,
} from '@/lib/admin/diagnostics/v4/buildDomainSnapshots'
import type { ResolvedBottleneck, SloEvaluationRow } from '@/lib/admin/diagnostics/v4/types'
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
    case 'db_provider_pressure':
      return 'Database / provider pressure'
    default:
      return id.replace(/_/g, ' ')
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
  return [
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
  ].filter((row) => row.count > 0)
}

function hasInsufficientDrain(count: number, metrics: IngestionMetricsResponse): boolean {
  if (count < INSUFFICIENT_DRAIN_QUEUE_MIN) return false
  const published24h = metrics.published24h
  const repairDrainProxy = metrics.funnel['24h'].stages.find((s) => s.id === 'published')?.count ?? 0
  return count >= INSUFFICIENT_DRAIN_QUEUE_MIN && repairDrainProxy <= published24h
}

function blockingSloBottleneck(
  blocking: readonly SloEvaluationRow[]
): ResolvedBottleneck | null {
  const first = blocking[0]
  if (!first) return null
  const domainMap: Record<string, ResolvedBottleneck['domain']> = {
    duplicate_canonical_clusters: 'duplicate_detection',
    parser_success_24h: 'parsing',
    publish_failed_terminal: 'publishing',
  }
  return {
    id: first.id,
    label: first.label,
    reason: `Blocking SLO failure: ${first.label}`,
    domain: domainMap[first.id] ?? 'slos',
    rawBottleneck: first.id,
  }
}

export function resolvePrimaryBottleneck(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  blockingSloFailures: readonly SloEvaluationRow[]
): ResolvedBottleneck {
  const blocking = blockingSloBottleneck(blockingSloFailures)
  if (blocking) return blocking

  const queues = queueCandidates(metrics, coverage)
  const agedQueues = queues
    .filter((q) => hasInsufficientDrain(q.count, metrics))
    .sort((a, b) => {
      const ageA = a.oldestAgeMs ?? a.count
      const ageB = b.oldestAgeMs ?? b.count
      return ageB - ageA
    })
  const topQueue = agedQueues[0]
  if (topQueue) {
    return {
      id: topQueue.id,
      label: topQueue.label,
      reason: `Largest aged queue with insufficient drain (${topQueue.count.toLocaleString()} rows)`,
      domain: topQueue.domain,
      rawBottleneck: metrics.volume.bottleneck,
    }
  }

  const visibility = buildVisibilitySnapshot(metrics, coverage)
  if (visibility.trueVisibilityFailure > 0) {
    return {
      id: 'visibility_failure',
      label: 'True visibility failures',
      reason: `${visibility.trueVisibilityFailure.toLocaleString()} true visibility failure(s)`,
      domain: 'visibility_coverage',
      rawBottleneck: metrics.volume.bottleneck,
    }
  }

  const duplicates = buildDuplicateHealthSnapshot(coverage)
  if (
    duplicates.canonicalPublishClusters > 0 ||
    exceedsVisibleDuplicateThreshold(duplicates.visibleDuplicateRate)
  ) {
    return {
      id: 'duplicate_health',
      label: 'Duplicate health',
      reason:
        duplicates.canonicalPublishClusters > 0
          ? `${duplicates.canonicalPublishClusters} canonical publish cluster(s)`
          : `Visible duplicate rate ${((duplicates.visibleDuplicateRate ?? 0) * 100).toFixed(2)}%`,
      domain: 'duplicate_detection',
      rawBottleneck: metrics.volume.bottleneck,
    }
  }

  const raw = metrics.volume.bottleneck
  return {
    id: raw,
    label: formatBottleneckLabel(raw),
    reason: 'Fallback volume bottleneck classifier',
    domain:
      raw === 'fetch'
        ? 'discovery'
        : raw === 'geocode'
          ? 'geocoding'
          : raw === 'publish'
            ? 'publishing'
            : raw === 'address_enrichment'
              ? 'catalog_repair'
              : 'pipeline',
    rawBottleneck: raw,
  }
}
