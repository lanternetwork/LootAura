import { countDuplicatePublishedCanonicalClusters } from '@/lib/admin/duplicateCanonicalPublishClusters'
import {
  listMissingValidObservations,
  traceMissingValidFalseExclusions,
} from '@/lib/ingestion/ystmCoverage/buildFalseExclusionAuditReport'
import { buildActionableMissingValidAggregate } from '@/lib/ingestion/ystmCoverage/buildActionableMissingValidAggregate'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import { aggregateYstmCoverageObservations } from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { computeCoveragePct } from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import { evaluateSeoEnablementMetricGate } from '@/lib/seo/evaluateSeoEnablementGate'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type SeoEnablementSnapshotBuildResult = {
  coveragePct: number | null
  effectiveMissingValid: number
  duplicateCanonicalClusters: number
  publishedActiveInventory: number
  seoGatePassed: boolean
  updatedAt: string
}

/**
 * Lightweight enablement snapshot builder — no scoreboard, trace persist, or metro inventory.
 */
export async function buildSeoEnablementSnapshot(
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  now: Date = new Date()
): Promise<SeoEnablementSnapshotBuildResult> {
  const [obsAgg, publishedIndex, duplicateClusters] = await Promise.all([
    aggregateYstmCoverageObservations(admin),
    loadLootAuraPublishedYstmIndex(admin, now),
    countDuplicatePublishedCanonicalClusters(admin),
  ])

  const coveragePct = computeCoveragePct({
    validActiveYstmUrls: obsAgg.validActiveYstmUrls,
    publishedVisibleInAudit: obsAgg.publishedVisibleInAudit,
  })

  const missingRows = await listMissingValidObservations(admin)
  const traced = await traceMissingValidFalseExclusions(admin, now, missingRows)
  const actionableMissingValid = await buildActionableMissingValidAggregate(admin, {
    traces: traced.traces,
    missingRows,
    now,
  })

  const coverage = {
    ok: true as const,
    coveragePct,
    publishedActiveLootAuraYstmUrls: publishedIndex.publishedActiveTotal,
    crossProviderConvergence: {
      duplicatePublishedCanonicalClusters: duplicateClusters,
    },
    actionableMissingValid,
  }

  const metric = evaluateSeoEnablementMetricGate(coverage)
  const updatedAt = now.toISOString()

  return {
    coveragePct,
    effectiveMissingValid: actionableMissingValid.effectiveMissingValidYstmUrls,
    duplicateCanonicalClusters: duplicateClusters,
    publishedActiveInventory: publishedIndex.publishedActiveTotal,
    seoGatePassed: metric.metricGatePass,
    updatedAt,
  }
}

export async function persistSeoEnablementSnapshot(
  result: SeoEnablementSnapshotBuildResult,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<void> {
  const { error } = await fromBase(admin, 'seo_enablement_snapshot').upsert(
    {
      id: 1,
      coverage_pct: result.coveragePct,
      effective_missing_valid: result.effectiveMissingValid,
      duplicate_canonical_clusters: result.duplicateCanonicalClusters,
      published_active_inventory: result.publishedActiveInventory,
      seo_gate_passed: result.seoGatePassed,
      updated_at: result.updatedAt,
    },
    { onConflict: 'id' }
  )

  if (error) {
    throw new Error(error.message)
  }
}

export async function refreshSeoEnablementSnapshotCron(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoEnablementSnapshotBuildResult> {
  const result = await buildSeoEnablementSnapshot(admin)
  await persistSeoEnablementSnapshot(result, admin)
  return result
}
