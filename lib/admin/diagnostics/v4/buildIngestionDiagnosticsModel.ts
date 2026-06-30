import { buildComputedAlerts, buildOperatorActions } from '@/lib/admin/diagnostics/v4/alerts'
import {
  buildBacklogSnapshot,
  buildCatalogRepairSnapshot,
  buildDuplicateHealthSnapshot,
  buildPipelineSnapshot,
  buildVisibilitySnapshot,
} from '@/lib/admin/diagnostics/v4/buildDomainSnapshots'
import { buildDomainHealth } from '@/lib/admin/diagnostics/v4/domainHealth'
import { resolvePrimaryBottleneck } from '@/lib/admin/diagnostics/v4/bottleneckResolver'
import { DIAGNOSTICS_MODEL_VERSION } from '@/lib/admin/diagnostics/v4/constants'
import { INGESTION_DIAGNOSTICS_REGISTRY } from '@/lib/admin/diagnostics/v4/registry'
import { buildSchedulerCronHealth } from '@/lib/admin/diagnostics/v4/schedulerHealth'
import { buildSeoReadinessSnapshot } from '@/lib/admin/diagnostics/v4/seoReadiness'
import {
  evaluateIngestionSlos,
  getBlockingSloFailures,
} from '@/lib/admin/diagnostics/v4/sloEvaluation'
import {
  buildTrendSummary,
  deriveSystemHealthAssessment,
} from '@/lib/admin/diagnostics/v4/systemHealth'
import type {
  BuildIngestionDiagnosticsModelInput,
  IngestionDiagnosticsModel,
} from '@/lib/admin/diagnostics/v4/types'

export function buildIngestionDiagnosticsModel(
  input: BuildIngestionDiagnosticsModelInput
): IngestionDiagnosticsModel {
  const generatedAt = input.generatedAt ?? input.metrics.generatedAt ?? new Date().toISOString()
  const environment = input.environment ?? 'unknown'
  const { metrics, coverage } = input

  const slos = evaluateIngestionSlos(metrics, coverage)
  const blockingSloFailures = getBlockingSloFailures(slos)
  const nonBlockingSloFailures = slos.filter((s) => !s.pass && !s.blocking)
  const catalogRepair = buildCatalogRepairSnapshot(metrics, coverage)
  const visibility = buildVisibilitySnapshot(metrics, coverage)
  const duplicates = buildDuplicateHealthSnapshot(coverage)
  const backlogs = buildBacklogSnapshot(metrics, coverage)
  const schedulerCrons = buildSchedulerCronHealth(metrics, coverage)

  const alerts = buildComputedAlerts(
    metrics,
    coverage,
    blockingSloFailures,
    nonBlockingSloFailures
  )

  const healthAssessment = deriveSystemHealthAssessment({
    blockingSloFailures,
    nonBlockingSloFailures,
    alerts,
    catalogRepairQueue: catalogRepair.queueTotal,
    refreshStale: backlogs.refreshStale,
    metrics,
    visibility,
    publishedActiveInventory: coverage?.publishedActiveLootAuraYstmUrls ?? 0,
    schedulerCrons,
  })

  const domainHealth = buildDomainHealth({
    metrics,
    coverage,
    alerts,
    slos,
    catalogRepair,
    visibility,
    duplicates,
    schedulerCrons,
    backlogs: {
      refreshStale: backlogs.refreshStale,
      geocodeEligible: backlogs.geocodeEligible,
    },
  })

  const primaryBottleneck = resolvePrimaryBottleneck(metrics, coverage, blockingSloFailures)
  const operatorActions = buildOperatorActions(metrics, coverage, alerts)

  return {
    diagnosticsModelVersion: DIAGNOSTICS_MODEL_VERSION,
    generatedAt,
    environment,
    metrics,
    coverage,
    registry: INGESTION_DIAGNOSTICS_REGISTRY,
    systemHealth: healthAssessment.level,
    healthReasons: healthAssessment.reasons,
    domainHealth,
    primaryBottleneck,
    operatorActions,
    alerts,
    slos,
    blockingSloFailures,
    trendSummary: buildTrendSummary(coverage),
    pipeline: buildPipelineSnapshot(metrics),
    catalogRepair,
    visibility,
    duplicates,
    backlogs,
    schedulerCrons,
    seoReadiness: buildSeoReadinessSnapshot(coverage),
  }
}
