import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateYstmStabilizationExit } from '@/lib/admin/ystmStabilizationExitCriteria'
import { evaluateSeoEnablementGate } from '@/lib/seo/evaluateSeoEnablementGate'
import { evaluateSeoIndexRolloutReadiness } from '@/lib/seo/indexRollout'
import { evaluateSeoIndexAllowlist } from '@/lib/seo/indexAllowlist'
import { evaluateSeoMetroParticipation } from '@/lib/seo/metroParticipation'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'
import { qualifyAllSeoMetros } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'

export type SeoOperationalSnapshot = {
  generatedAt: string
  enablement: ReturnType<typeof evaluateSeoEnablementGate>
  /** Legacy stabilization allowlist — unchanged for YSTM tier display. */
  allowlist: ReturnType<typeof evaluateSeoIndexAllowlist>
  stabilization: ReturnType<typeof evaluateYstmStabilizationExit>
  rollout: ReturnType<typeof evaluateSeoIndexRolloutReadiness>
  metroQualification: ReturnType<typeof qualifyAllSeoMetros>
  metroParticipation: ReturnType<typeof evaluateSeoMetroParticipation>
  sitemap: {
    staticUrlCount: number
    listingChunkCount: number
    listingUrlCount: number
    cityUrlCount: number
    weekendUrlCount: number
    indexingEnabled: boolean
    listingIndexingEnabled: boolean
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
  metros: SeoMetro[]
  inventoryByMetroSlug?: Record<string, SeoInventorySummary>
  rolloutState: SeoRolloutRuntimeState
}): SeoOperationalSnapshot {
  const { metrics, coverage, sitemapCounts, metros, inventoryByMetroSlug = {}, rolloutState } =
    options
  const enablement = evaluateSeoEnablementGate(coverage, rolloutState)
  const allowlist = evaluateSeoIndexAllowlist(metrics, coverage, rolloutState)
  const stabilization = evaluateYstmStabilizationExit(metrics, coverage)
  const rollout = evaluateSeoIndexRolloutReadiness({
    coverage,
    metros,
    inventoryByMetroSlug,
    rolloutState,
  })
  const metroQualification = qualifyAllSeoMetros({
    metros,
    nationalIndexingAllowed: rollout.seoEmissionAllowed,
    inventoryBySlug: inventoryByMetroSlug,
  })
  const metroParticipation = evaluateSeoMetroParticipation({
    metros,
    nationalIndexingAllowed: rollout.seoEmissionAllowed,
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

  return {
    generatedAt: new Date().toISOString(),
    enablement,
    allowlist,
    stabilization,
    rollout,
    metroQualification,
    metroParticipation,
    sitemap: {
      ...sitemapCounts,
      indexingEnabled: rollout.indexingAllowed,
      listingIndexingEnabled: rollout.seoEmissionAllowed,
    },
    metrics: {
      indexedMetros: rollout.qualifiedMetroSlugs.length,
      crawlableInventoryPct: averageCrawlableInventoryPct(inventoryByMetroSlug),
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

export function emptyInventoryByMetroSlug(): Record<string, SeoInventorySummary> {
  return {}
}

/** @deprecated use emptyInventoryByMetroSlug */
export function emptyInventoryByPilotSlug(): Record<string, SeoInventorySummary> {
  return emptyInventoryByMetroSlug()
}

function averageCrawlableInventoryPct(
  inventoryBySlug: Record<string, SeoInventorySummary>
): number | null {
  const values = Object.values(inventoryBySlug).filter((v) => v.activeListingCount > 0)
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v.crawlableInventoryPct, 0) / values.length
}
