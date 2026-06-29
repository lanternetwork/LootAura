import { buildComputedAlerts, buildOperatorActions } from '@/lib/admin/diagnostics/v4/alerts'
import {
  buildBacklogSnapshot,
  buildCatalogRepairSnapshot,
  buildDuplicateHealthSnapshot,
  buildPipelineSnapshot,
  buildVisibilitySnapshot,
} from '@/lib/admin/diagnostics/v4/buildDomainSnapshots'
import { resolvePrimaryBottleneck } from '@/lib/admin/diagnostics/v4/bottleneckResolver'
import {
  DIAGNOSTICS_MODEL_VERSION,
} from '@/lib/admin/diagnostics/v4/constants'
import { INGESTION_DIAGNOSTICS_REGISTRY } from '@/lib/admin/diagnostics/v4/registry'
import { buildSchedulerCronHealth } from '@/lib/admin/diagnostics/v4/schedulerHealth'
import { buildSeoReadinessSnapshot } from '@/lib/admin/diagnostics/v4/seoReadiness'
import {
  evaluateIngestionSlos,
  getBlockingSloFailures,
} from '@/lib/admin/diagnostics/v4/sloEvaluation'
import {
  buildTrendSummary,
  deriveSystemHealthLevel,
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
  const alerts = buildComputedAlerts(metrics, coverage, blockingSloFailures)
  const catalogRepair = buildCatalogRepairSnapshot(metrics, coverage)
  const systemHealth = deriveSystemHealthLevel(
    blockingSloFailures,
    alerts,
    catalogRepair.queueTotal
  )
  const primaryBottleneck = resolvePrimaryBottleneck(metrics, coverage, blockingSloFailures)
  const operatorActions = buildOperatorActions(metrics, coverage, alerts)

  return {
    diagnosticsModelVersion: DIAGNOSTICS_MODEL_VERSION,
    generatedAt,
    environment,
    metrics,
    coverage,
    registry: INGESTION_DIAGNOSTICS_REGISTRY,
    systemHealth,
    primaryBottleneck,
    operatorActions,
    alerts,
    slos,
    blockingSloFailures,
    trendSummary: buildTrendSummary(coverage),
    pipeline: buildPipelineSnapshot(metrics),
    catalogRepair,
    visibility: buildVisibilitySnapshot(metrics, coverage),
    duplicates: buildDuplicateHealthSnapshot(coverage),
    backlogs: buildBacklogSnapshot(metrics, coverage),
    schedulerCrons: buildSchedulerCronHealth(coverage),
    seoReadiness: buildSeoReadinessSnapshot(coverage),
  }
}
