import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateSeoIndexAllowlist } from '@/lib/seo/indexAllowlist'
import { qualifyAllPilotMetros } from '@/lib/seo/metroQualification'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'
import type { SeoInventorySummary } from '@/lib/seo/types'

export type SeoOperationalSnapshot = {
  generatedAt: string
  allowlist: ReturnType<typeof evaluateSeoIndexAllowlist>
  pilotMetros: ReturnType<typeof qualifyAllPilotMetros>
  sitemap: {
    staticUrlCount: number
    listingChunkCount: number
    listingUrlCount: number
    cityUrlCount: number
    weekendUrlCount: number
    indexingEnabled: boolean
  }
  metrics: {
    indexedMetros: number
    crawlableInventoryPct: number | null
    staleInventoryPct: number | null
    canonicalCoveragePct: number | null
    duplicateCanonicalClusters: number | null
    duplicateVisibleClusters: number | null
    catalogRepairQueue: number | null
    missingValidUrls: number | null
  }
}

export type SeoSitemapCounts = {
  staticUrlCount: number
  listingChunkCount: number
  listingUrlCount: number
  cityUrlCount: number
  weekendUrlCount: number
}

export function buildSeoOperationalSnapshot(options: {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  sitemapCounts: SeoSitemapCounts
  inventoryByMetroSlug?: Record<string, SeoInventorySummary>
}): SeoOperationalSnapshot {
  const { metrics, coverage, sitemapCounts, inventoryByMetroSlug = {} } = options
  const allowlist = evaluateSeoIndexAllowlist(metrics, coverage)
  const pilotMetros = qualifyAllPilotMetros({
    nationalIndexingAllowed: allowlist.indexingAllowed,
    inventoryBySlug: inventoryByMetroSlug,
  })

  const publishedActive = coverage?.publishedActiveLootAuraYstmUrls ?? null
  const duplicateVisible =
    coverage?.falseExclusionSaleIdentity?.duplicateVisibleSaleClusters24h ?? null
  const refreshStale =
    coverage?.pipelineBacklog?.existingRefreshStale ??
    coverage?.existingRefresh?.staleOver12h ??
    null
  const stalePct =
    publishedActive != null && refreshStale != null && publishedActive > 0
      ? refreshStale / publishedActive
      : null

  const qualifiedCount = pilotMetros.filter((m) => m.qualified).length

  return {
    generatedAt: new Date().toISOString(),
    allowlist,
    pilotMetros,
    sitemap: {
      ...sitemapCounts,
      indexingEnabled: allowlist.indexingAllowed,
    },
    metrics: {
      indexedMetros: allowlist.indexingAllowed ? qualifiedCount : 0,
      crawlableInventoryPct: null,
      staleInventoryPct: stalePct,
      canonicalCoveragePct: coverage?.canonicalSaleInstance?.canonicalCoveragePct ?? null,
      duplicateCanonicalClusters:
        coverage?.crossProviderConvergence?.duplicatePublishedCanonicalClusters ?? null,
      duplicateVisibleClusters: duplicateVisible,
      catalogRepairQueue:
        coverage?.catalogRepair?.repairQueueTotal ??
        coverage?.pipelineBacklog?.catalogRepairQueue ??
        null,
      missingValidUrls: coverage?.missingValidYstmUrls ?? null,
    },
  }
}

export function emptyInventoryByPilotSlug(): Record<string, SeoInventorySummary> {
  return Object.fromEntries(
    SEO_PILOT_METROS.map((m) => [
      m.slug,
      { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
    ])
  )
}
