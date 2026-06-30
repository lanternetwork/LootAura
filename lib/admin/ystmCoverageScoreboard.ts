import {
  aggregateMissingIngestFetchFailed,
  type MissingIngestFetchFailedAggregate,
} from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedCandidates'
import {
  aggregateYstmCoverageMissingIngestion,
  aggregateYstmCoverageObservations,
  type YstmCoverageMissingIngestionAggregate,
  type YstmCoverageObservationAggregate,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import {
  buildYstmCoveragePipelineBacklog,
  evaluateYstmCoverageOperationalHealth,
  type YstmCoverageOperationalHealth,
  type YstmCoveragePipelineBacklog,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageOperationalHealth'
import {
  computeCoverageSloAttainment,
  type YstmCoverageSloAttainment,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageSloAttainment'
import {
  computeCoveragePct,
  YSTM_COVERAGE_TARGET_PCT,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import {
  buildYstmGraphEnumerationMetrics,
  type YstmGraphEnumerationMetrics,
} from '@/lib/admin/ystmGraphEnumerationMetrics'
import {
  buildYstmSourceExpansionMetrics,
  type YstmSourceExpansionMetrics,
} from '@/lib/admin/ystmSourceExpansionMetrics'
import {
  aggregateYstmCatalogRepair,
  type YstmCatalogRepairAggregate,
} from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairMetrics'
import {
  aggregateYstmExistingUrlRefresh,
  type YstmExistingUrlRefreshAggregate,
} from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshMetrics'
import { formatFalseExclusionAuditReport, listMissingValidObservations, traceMissingValidFalseExclusions } from '@/lib/ingestion/ystmCoverage/buildFalseExclusionAuditReport'
import { buildActionableMissingValidAggregate } from '@/lib/ingestion/ystmCoverage/buildActionableMissingValidAggregate'
import type { ActionableMissingValidAggregate } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliationTypes'
import { persistFalseExclusionTraces } from '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
import type { FalseExclusionAuditReport } from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { buildSaleInstanceShadowReplayReport } from '@/lib/ingestion/ystmCoverage/buildSaleInstanceShadowReplayReport'
import type { SaleInstanceShadowReplayReport } from '@/lib/ingestion/ystmCoverage/saleInstanceShadowReplayTypes'
import {
  loadSaleInstanceIdentityMetrics,
  type SaleInstanceIdentityMetrics,
} from '@/lib/admin/saleInstanceIdentityMetrics'
import {
  loadCanonicalSaleInstanceMetrics,
  type CanonicalSaleInstanceMetrics,
} from '@/lib/admin/canonicalSaleInstanceMetrics'
import {
  loadCrossProviderShadowMetrics,
  type CrossProviderShadowMetrics,
} from '@/lib/admin/crossProviderShadowMetrics'
import {
  loadCrossProviderConvergenceMetrics,
  type CrossProviderConvergenceMetrics,
} from '@/lib/admin/crossProviderConvergenceMetrics'
import {
  buildYstmFalseExclusionSaleIdentityDashboard,
  type YstmFalseExclusionSaleIdentityDashboard,
} from '@/lib/admin/ystmFalseExclusionSaleIdentityDashboard'
import {
  loadSourceUrlAliasMetrics,
  type SourceUrlAliasMetrics,
} from '@/lib/admin/sourceUrlAliasMetrics'
import {
  evaluateCoverageBootstrapExitCriteria,
  fetchCoverageBootstrapState,
  maybeAutoDisableCoverageBootstrap,
  type CoverageBootstrapState,
} from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import {
  countEsnetCrawlableIngestionConfigs,
  evaluateEsnetCoverageBootstrapExitCriteria,
  maybeAutoDisableEsnetCoverageBootstrap,
} from '@/lib/ingestion/estatesalesnet/esnetCoverageBootstrapExit'
import {
  fetchEsnetBootstrapState,
  fetchEsnetIngestState,
  type EsnetProviderRuntimeState,
} from '@/lib/ingestion/estatesalesnet/esnetOrchestrationState'
import { parseEsnetIngestMinIntervalMinutes } from '@/lib/ingestion/estatesalesnet/esnetIngestionOrchestrationDefaults'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import {
  loadYstmDiscoveryFreshnessMetrics,
  type YstmDiscoveryFreshnessMetrics,
} from '@/lib/ingestion/ystmCoverage/discoveryFreshness/loadYstmDiscoveryFreshnessMetrics'
import {
  loadYstm2HourIngestionDiagnostics,
  type Ystm2HourIngestionDiagnostics,
} from '@/lib/admin/loadYstm2HourIngestionDiagnostics'
import type { MissingIngestCronHealth } from '@/lib/admin/evaluateMissingIngestCronHealth'
import { loadMissingIngestCronHealth } from '@/lib/admin/loadMissingIngestCronHealth'
import type { CoverageScoreboardPerformanceSink } from '@/lib/admin/diagnostics/v4/performance/scoreboardPerformanceSink'
import { emptyCoveragePerformance } from '@/lib/admin/diagnostics/v4/performance/buildDiagnosticsPerformance'
import { elapsedMs, timeAsync, timeSync } from '@/lib/admin/diagnostics/v4/performance/timing'
import type { ShadowReplayPerformanceSink } from '@/lib/ingestion/ystmCoverage/buildSaleInstanceShadowReplayReport'

export type YstmCoverageTrendPoint = {
  completedAt: string
  coveragePct: number | null
  validActiveYstmUrls: number
  publishedVisibleInAudit: number
}

export type YstmCoverageScoreboard = {
  targetPct: number
  generatedAt: string
  lastAuditAt: string | null
  lastAuditStatus: string | null
  validActiveYstmUrls: number
  publishedActiveLootAuraYstmUrls: number
  publishedVisibleInAuditFootprint: number
  missingValidYstmUrls: number
  actionableMissingValid: ActionableMissingValidAggregate
  coveragePct: number | null
  observationFootprintUrls: number
  missingByState: Record<string, number>
  missingByMetro: Record<string, number>
  trend: YstmCoverageTrendPoint[]
  lastRun: {
    listPagesFetched: number
    listingUrlsDiscovered: number
    detailPagesValidated: number
    configCursorAfter: number
  } | null
  sourceExpansion: YstmSourceExpansionMetrics
  missingIngestion: YstmCoverageMissingIngestionAggregate
  missingIngestFetchFailed: MissingIngestFetchFailedAggregate
  existingRefresh: YstmExistingUrlRefreshAggregate
  catalogRepair: YstmCatalogRepairAggregate
  pipelineBacklog: YstmCoveragePipelineBacklog
  sloAttainment: YstmCoverageSloAttainment
  graphEnumeration: YstmGraphEnumerationMetrics
  operationalHealth: YstmCoverageOperationalHealth
  falseExclusionAudit: FalseExclusionAuditReport
  saleInstanceShadowReplay: SaleInstanceShadowReplayReport
  saleInstanceIdentity: SaleInstanceIdentityMetrics
  canonicalSaleInstance: CanonicalSaleInstanceMetrics
  crossProviderShadow: CrossProviderShadowMetrics
  crossProviderConvergence: CrossProviderConvergenceMetrics
  sourceUrlAlias: SourceUrlAliasMetrics
  falseExclusionSaleIdentity: YstmFalseExclusionSaleIdentityDashboard
  coverageBootstrap: CoverageBootstrapState & {
    exitCriteriaPreview: { met: boolean; reasons: string[] }
  }
  esnetIngest: EsnetProviderRuntimeState & {
    crawlableConfigCount: number
    ingestMinIntervalMinutes: number
  }
  esnetBootstrap: EsnetProviderRuntimeState & {
    exitCriteriaPreview: { met: boolean; reasons: string[] }
  }
  discoveryFreshness: YstmDiscoveryFreshnessMetrics
  twoHourIngestion: Ystm2HourIngestionDiagnostics
  missingIngestCronHealth: MissingIngestCronHealth
}

export type { MissingIngestCronHealth }

type AuditRunRow = {
  completed_at: string | null
  status: string
  coverage_pct: number | string | null
  valid_active_ystm_urls: number | null
  published_visible_in_audit: number | null
  list_pages_fetched: number | null
  listing_urls_discovered: number | null
  detail_pages_validated: number | null
  config_cursor_after: number | null
}

function topEntries(map: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  )
}

export async function buildYstmCoverageScoreboard(
  admin: ReturnType<typeof getAdminDb>,
  performanceSink?: CoverageScoreboardPerformanceSink
): Promise<YstmCoverageScoreboard> {
  const scoreboardStart = performance.now()
  const coveragePerf = performanceSink?.coverage ?? emptyCoveragePerformance()
  const writeCounter = performanceSink?.writeCounter
  const now = new Date()

  const [missingRows, listMs] = await timeAsync(() => listMissingValidObservations(admin))
  coveragePerf.missing_valid_list_duration_ms = listMs

  const [traceArtifacts, traceMs] = await timeAsync(() =>
    traceMissingValidFalseExclusions(admin, now, missingRows)
  )
  coveragePerf.false_exclusion_trace_duration_ms = traceMs

  const [, persistMs] = await timeAsync(() =>
    persistFalseExclusionTraces(admin, traceArtifacts.persistEntries, now.getTime(), writeCounter)
  )
  coveragePerf.false_exclusion_persist_duration_ms = persistMs

  const [falseExclusionAudit, formatMs] = timeSync(() =>
    formatFalseExclusionAuditReport(traceArtifacts)
  )
  coveragePerf.false_exclusion_format_duration_ms = formatMs

  const shadowReplayPerf: ShadowReplayPerformanceSink = {
    computeDurationMs: 0,
    persistDurationMs: 0,
  }
  const parallelStart = performance.now()
  const [
    [agg, aggMs],
    publishedIndex,
    sourceExpansion,
    graphEnumeration,
    missingIngestion,
    [existingRefresh, existingRefreshMs],
    [catalogRepair, catalogRepairMs],
    [actionableMissingValid, actionableMs],
    saleInstanceShadowReplay,
    saleInstanceIdentity,
    canonicalSaleInstance,
    crossProviderShadow,
    crossProviderConvergence,
    sourceUrlAlias,
    runsResult,
    discoveryFreshnessResult,
    missingIngestFetchFailed,
    twoHourIngestion,
    missingIngestCronHealth,
  ] = await Promise.all([
    timeAsync(() => aggregateYstmCoverageObservations(admin)),
    loadLootAuraPublishedYstmIndex(admin, now),
    buildYstmSourceExpansionMetrics(admin, now.getTime()),
    buildYstmGraphEnumerationMetrics(admin, now.getTime()),
    aggregateYstmCoverageMissingIngestion(admin),
    timeAsync(() => aggregateYstmExistingUrlRefresh(admin, now.getTime())),
    timeAsync(() => aggregateYstmCatalogRepair(admin, now.getTime())),
    timeAsync(() =>
      buildActionableMissingValidAggregate(admin, {
        traces: traceArtifacts.traces,
        missingRows: traceArtifacts.missingRows,
        now,
      })
    ),
    buildSaleInstanceShadowReplayReport(admin, missingRows, now, {
      writeCounter,
      performance: shadowReplayPerf,
    }),
    loadSaleInstanceIdentityMetrics(),
    loadCanonicalSaleInstanceMetrics(),
    loadCrossProviderShadowMetrics(now.getTime()),
    loadCrossProviderConvergenceMetrics(now.getTime()),
    loadSourceUrlAliasMetrics(),
    fromBase(admin, 'ystm_coverage_audit_runs')
      .select(
        'completed_at, status, coverage_pct, valid_active_ystm_urls, published_visible_in_audit, list_pages_fetched, listing_urls_discovered, detail_pages_validated, config_cursor_after'
      )
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(48),
    loadYstmDiscoveryFreshnessMetrics(admin, now.getTime()),
    aggregateMissingIngestFetchFailed(admin, now.getTime()),
    loadYstm2HourIngestionDiagnostics(admin, now.getTime()),
    loadMissingIngestCronHealth(admin, now.getTime()),
  ])
  coveragePerf.coverage_parallel_block_duration_ms = elapsedMs(parallelStart)
  coveragePerf.coverage_observation_aggregate_duration_ms = aggMs
  coveragePerf.existing_refresh_aggregate_duration_ms = existingRefreshMs
  coveragePerf.catalog_repair_aggregate_duration_ms = catalogRepairMs
  coveragePerf.actionable_missing_aggregate_duration_ms = actionableMs
  coveragePerf.shadow_replay_duration_ms = shadowReplayPerf.computeDurationMs
  coveragePerf.shadow_replay_persist_duration_ms = shadowReplayPerf.persistDurationMs

  if (runsResult.error) {
    throw new Error(runsResult.error.message)
  }

  const runs = (runsResult.data ?? []) as AuditRunRow[]
  const last = runs[0] ?? null
  const coveragePct = computeCoveragePct({
    validActiveYstmUrls: agg.validActiveYstmUrls,
    publishedVisibleInAudit: agg.publishedVisibleInAudit,
  })

  const trend: YstmCoverageTrendPoint[] = runs
    .filter((r) => r.completed_at)
    .map((r) => ({
      completedAt: r.completed_at as string,
      coveragePct:
        r.coverage_pct == null
          ? null
          : typeof r.coverage_pct === 'number'
            ? r.coverage_pct
            : Number.parseFloat(String(r.coverage_pct)),
      validActiveYstmUrls: r.valid_active_ystm_urls ?? 0,
      publishedVisibleInAudit: r.published_visible_in_audit ?? 0,
    }))
    .reverse()

  const pipelineBacklog = buildYstmCoveragePipelineBacklog({
    missingValidYstmUrls: agg.missingValidYstmUrls,
    missingIngestion,
    catalogRepair,
    existingRefresh,
  })

  const sloAttainment = computeCoverageSloAttainment({
    trend,
    targetPct: YSTM_COVERAGE_TARGET_PCT,
    currentCoveragePct: coveragePct,
    currentValidActiveUrls: agg.validActiveYstmUrls,
  })

  const operationalHealth = evaluateYstmCoverageOperationalHealth({
    targetPct: YSTM_COVERAGE_TARGET_PCT,
    coveragePct,
    validActiveYstmUrls: agg.validActiveYstmUrls,
    missingValidYstmUrls: agg.missingValidYstmUrls,
    lastAuditAt: last?.completed_at ?? null,
    trend,
    missingIngestionQueue: missingIngestion.missingQueueTotal,
    missingIngestionNeverAttempted: missingIngestion.missingIngestionNeverAttempted,
    catalogRepairQueue: catalogRepair.repairQueueTotal,
    existingRefreshStale: existingRefresh.staleOver12h,
    configsWithoutSourcePages: sourceExpansion.configsWithoutSourcePages,
    crawlableConfigs: sourceExpansion.crawlableConfigs,
    consecutiveDaysAtTarget: sloAttainment.consecutiveDaysAtTarget,
    requiredConsecutiveDaysAtTarget: sloAttainment.requiredConsecutiveDays,
    footprintMeetsProgramMinimum: sloAttainment.footprintMeetsProgramMinimum,
    nowMs: now.getTime(),
  })

  const [falseExclusionSaleIdentity, identityMs] = await timeAsync(() =>
    buildYstmFalseExclusionSaleIdentityDashboard(
      admin,
      {
        missingValidYstmUrls: agg.missingValidYstmUrls,
        missingNeverAttempted: missingIngestion.missingIngestionNeverAttempted,
        saleInstanceIdentity,
        saleInstanceShadowReplay,
      },
      now
    )
  )
  coveragePerf.false_exclusion_sale_identity_duration_ms = identityMs

  const bootstrapStart = performance.now()
  let coverageBootstrap = await fetchCoverageBootstrapState(admin)
  const exitCriteriaPreview = evaluateCoverageBootstrapExitCriteria({
    coveragePct,
    missingValidYstmUrls: agg.missingValidYstmUrls,
    validActiveYstmUrls: agg.validActiveYstmUrls,
    catalogRepairQueue: catalogRepair.repairQueueTotal,
    fetchFailureRate24h: graphEnumeration.fetchFailureRate24h,
    blockRate24h: graphEnumeration.blockRate24h,
    enabledAt: coverageBootstrap.enabledAt,
    nowMs: now.getTime(),
  })

  if (coverageBootstrap.enabled) {
    await maybeAutoDisableCoverageBootstrap(
      admin,
      {
        coveragePct,
        missingValidYstmUrls: agg.missingValidYstmUrls,
        validActiveYstmUrls: agg.validActiveYstmUrls,
        catalogRepairQueue: catalogRepair.repairQueueTotal,
        fetchFailureRate24h: graphEnumeration.fetchFailureRate24h,
        blockRate24h: graphEnumeration.blockRate24h,
        enabledAt: coverageBootstrap.enabledAt,
        nowMs: now.getTime(),
      },
      writeCounter
    )
    coverageBootstrap = await fetchCoverageBootstrapState(admin)
  }

  const esnetCrawlableConfigCount = await countEsnetCrawlableIngestionConfigs(admin)
  const esnetIngest = await fetchEsnetIngestState(admin)
  let esnetBootstrap = await fetchEsnetBootstrapState(admin)
  const esnetExitCriteriaPreview = evaluateEsnetCoverageBootstrapExitCriteria({
    crawlableConfigCount: esnetCrawlableConfigCount,
    fetchFailureRate24h: graphEnumeration.fetchFailureRate24h,
    enabledAt: esnetBootstrap.enabledAt,
    nowMs: now.getTime(),
  })

  if (esnetBootstrap.enabled) {
    await maybeAutoDisableEsnetCoverageBootstrap(
      admin,
      {
        crawlableConfigCount: esnetCrawlableConfigCount,
        fetchFailureRate24h: graphEnumeration.fetchFailureRate24h,
        nowMs: now.getTime(),
      },
      writeCounter
    )
    esnetBootstrap = await fetchEsnetBootstrapState(admin)
  }
  coveragePerf.bootstrap_checks_duration_ms = elapsedMs(bootstrapStart)

  if (performanceSink) {
    const serialMs =
      coveragePerf.missing_valid_list_duration_ms +
      coveragePerf.false_exclusion_trace_duration_ms +
      coveragePerf.false_exclusion_persist_duration_ms +
      coveragePerf.false_exclusion_format_duration_ms
    const postParallelMs =
      coveragePerf.false_exclusion_sale_identity_duration_ms +
      coveragePerf.bootstrap_checks_duration_ms
    const accountedMs =
      serialMs + coveragePerf.coverage_parallel_block_duration_ms + postParallelMs
    coveragePerf.coverage_unattributed_duration_ms = Math.max(
      0,
      elapsedMs(scoreboardStart) - accountedMs
    )
  }

  return {
    targetPct: YSTM_COVERAGE_TARGET_PCT,
    generatedAt: now.toISOString(),
    lastAuditAt: last?.completed_at ?? null,
    lastAuditStatus: last?.status ?? null,
    validActiveYstmUrls: agg.validActiveYstmUrls,
    publishedActiveLootAuraYstmUrls: publishedIndex.publishedActiveTotal,
    publishedVisibleInAuditFootprint: agg.publishedVisibleInAudit,
    missingValidYstmUrls: agg.missingValidYstmUrls,
    actionableMissingValid,
    coveragePct,
    observationFootprintUrls: agg.observationCount,
    missingByState: topEntries(agg.missingByState, 20),
    missingByMetro: topEntries(agg.missingByMetro, 20),
    trend,
    lastRun: last
      ? {
          listPagesFetched: last.list_pages_fetched ?? 0,
          listingUrlsDiscovered: last.listing_urls_discovered ?? 0,
          detailPagesValidated: last.detail_pages_validated ?? 0,
          configCursorAfter: last.config_cursor_after ?? 0,
        }
      : null,
    sourceExpansion,
    graphEnumeration,
    missingIngestion,
    missingIngestFetchFailed,
    existingRefresh,
    catalogRepair,
    pipelineBacklog,
    sloAttainment,
    operationalHealth,
    falseExclusionAudit,
    saleInstanceShadowReplay,
    saleInstanceIdentity,
    canonicalSaleInstance,
    crossProviderShadow,
    crossProviderConvergence,
    sourceUrlAlias,
    falseExclusionSaleIdentity,
    coverageBootstrap: {
      ...coverageBootstrap,
      exitCriteriaPreview,
    },
    esnetIngest: {
      ...esnetIngest,
      crawlableConfigCount: esnetCrawlableConfigCount,
      ingestMinIntervalMinutes: parseEsnetIngestMinIntervalMinutes(esnetBootstrap.enabled),
    },
    esnetBootstrap: {
      ...esnetBootstrap,
      exitCriteriaPreview: esnetExitCriteriaPreview,
    },
    discoveryFreshness: discoveryFreshnessResult,
    twoHourIngestion,
    missingIngestCronHealth,
  }
}

export type { YstmSourceExpansionMetrics }

export type { YstmCoverageObservationAggregate }
