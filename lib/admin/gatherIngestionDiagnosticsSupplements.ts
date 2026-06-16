import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { IngestionDiagnosticsSupplements } from '@/lib/admin/ingestionDiagnosticsSupplements'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import type { DuplicateCanonicalPublishCluster } from '@/lib/admin/duplicateCanonicalPublishClusterTypes'
import {
  buildSeoOperationalSnapshot,
  emptyInventoryByMetroSlug,
} from '@/lib/seo/buildSeoOperationalSnapshot'
import { computeSeoSitemapCounts } from '@/lib/seo/sitemap/computeSitemapCounts'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'
import {
  SEO_ROLLOUT_DISABLED_STATE,
  type SeoRolloutRuntimeState,
} from '@/lib/seo/seoRolloutTypes'
import type { CoverageTieredSchedulerState } from '@/lib/ingestion/ystmCoverage/coverageTieredSchedulerMode'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  const json = (await res.json()) as T & { ok?: boolean; message?: string }
  if (!res.ok || json.ok === false) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return json
}

function parseRolloutState(body: {
  rolloutState?: SeoRolloutRuntimeState
}): SeoRolloutRuntimeState {
  const s = body.rolloutState
  if (!s) return SEO_ROLLOUT_DISABLED_STATE
  return {
    publicIndexingEnabled: s.publicIndexingEnabled === true,
    publicIndexingEnabledAt: s.publicIndexingEnabledAt ?? null,
    publicIndexingDisabledAt: s.publicIndexingDisabledAt ?? null,
    crawlValidationPassed: s.crawlValidationPassed === true,
    crawlValidationPassedAt: s.crawlValidationPassedAt ?? null,
    searchConsoleValidationPassed: s.searchConsoleValidationPassed === true,
    searchConsoleValidationPassedAt: s.searchConsoleValidationPassedAt ?? null,
  }
}

/**
 * Fetches dashboard-only ingestion panels for clipboard export (browser).
 */
export async function gatherIngestionDiagnosticsSupplements(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): Promise<IngestionDiagnosticsSupplements> {
  const supplements: IngestionDiagnosticsSupplements = {}

  const [tieredResult, seoRolloutResult, metroInventoryResult, clustersResult] =
    await Promise.allSettled([
      fetchJson<{ coverageTieredScheduler: CoverageTieredSchedulerState }>(
        '/api/admin/ingestion/coverage-tiered-scheduler'
      ),
      fetchJson<{ rolloutState?: SeoRolloutRuntimeState }>('/api/admin/seo/rollout-state'),
      fetchJson<{
        metros: SeoMetro[]
        inventoryBySlug: Record<string, SeoInventorySummary>
      }>('/api/admin/seo/metro-inventory'),
      fetchJson<{
        generatedAt: string
        clusters: DuplicateCanonicalPublishCluster[]
      }>('/api/admin/ingestion/duplicate-canonical-clusters?limit=50'),
    ])

  if (tieredResult.status === 'fulfilled') {
    supplements.tieredScheduler = tieredResult.value.coverageTieredScheduler
  } else {
    supplements.tieredSchedulerError =
      tieredResult.reason instanceof Error
        ? tieredResult.reason.message
        : String(tieredResult.reason)
  }

  if (clustersResult.status === 'fulfilled') {
    supplements.duplicateCanonicalClusters = {
      generatedAt: clustersResult.value.generatedAt,
      clusters: clustersResult.value.clusters,
    }
  } else {
    supplements.duplicateCanonicalClustersError =
      clustersResult.reason instanceof Error
        ? clustersResult.reason.message
        : String(clustersResult.reason)
  }

  let rolloutState = SEO_ROLLOUT_DISABLED_STATE
  if (seoRolloutResult.status === 'fulfilled') {
    rolloutState = parseRolloutState(seoRolloutResult.value)
  }

  let metros: SeoMetro[] = []
  let inventoryBySlug = emptyInventoryByMetroSlug()
  let inventoryLoadStatus: 'loaded' | 'unavailable' = 'unavailable'
  if (metroInventoryResult.status === 'fulfilled') {
    metros = metroInventoryResult.value.metros
    inventoryBySlug = metroInventoryResult.value.inventoryBySlug
    inventoryLoadStatus = 'loaded'
  }

  const publishedListingCount = coverage?.publishedActiveLootAuraYstmUrls ?? 0
  const provisional = buildSeoOperationalSnapshot({
    metrics,
    coverage,
    sitemapCounts: computeSeoSitemapCounts({
      totalPublishedListings: publishedListingCount,
      inventoryIndexingAllowed: false,
      metros,
      inventoryBySlug,
    }),
    metros,
    inventoryByMetroSlug: inventoryBySlug,
    rolloutState,
  })
  const snapshot = buildSeoOperationalSnapshot({
    metrics,
    coverage,
    sitemapCounts: computeSeoSitemapCounts({
      totalPublishedListings: publishedListingCount,
      inventoryIndexingAllowed: provisional.rollout.indexingAllowed,
      metros,
      inventoryBySlug,
    }),
    metros,
    inventoryByMetroSlug: inventoryBySlug,
    rolloutState,
  })

  supplements.seoOperational = {
    snapshot,
    rolloutState,
    metroCount: metros.length,
    inventoryLoadStatus,
  }

  return supplements
}
