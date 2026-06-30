import type {
  IngestionDiagnosticsCoveragePerformance,
  IngestionDiagnosticsPerformance,
} from '@/lib/admin/diagnostics/v4/types'
import {
  deriveRouteWallClockSlowest,
  deriveSingleSpanSlowest,
  type TimedSpan,
} from '@/lib/admin/diagnostics/v4/performance/deriveSlowestStage'
import type { DiagnosticsWriteCounter } from '@/lib/admin/diagnostics/v4/performance/writeCounter'

export type BuildIngestionDiagnosticsPerformanceInput = {
  readonly generatedAt: string
  readonly apiRouteDurationMs: number
  readonly totalDurationMs: number
  readonly coreMetricsDurationMs: number
  readonly diagnosticsMetricsDurationMs: number
  readonly coverageScoreboardDurationMs: number
  readonly mergeDurationMs: number
  readonly modelBuildDurationMs: number
  readonly jsonPayloadBytes: number | null
  readonly coverage: IngestionDiagnosticsCoveragePerformance
  readonly writeCounter: DiagnosticsWriteCounter
}

const COVERAGE_SPAN_KEYS: ReadonlyArray<{
  key: keyof IngestionDiagnosticsCoveragePerformance
  name: string
}> = [
  { key: 'missing_valid_list_duration_ms', name: 'missing_valid_list' },
  { key: 'false_exclusion_trace_duration_ms', name: 'false_exclusion_trace' },
  { key: 'false_exclusion_persist_duration_ms', name: 'false_exclusion_persist' },
  { key: 'false_exclusion_format_duration_ms', name: 'false_exclusion_format' },
  { key: 'coverage_parallel_block_duration_ms', name: 'coverage_parallel_block' },
  { key: 'shadow_replay_duration_ms', name: 'shadow_replay_compute' },
  { key: 'shadow_replay_persist_duration_ms', name: 'shadow_replay_persist' },
  { key: 'coverage_observation_aggregate_duration_ms', name: 'coverage_observation_aggregate' },
  { key: 'existing_refresh_aggregate_duration_ms', name: 'existing_refresh_aggregate' },
  { key: 'catalog_repair_aggregate_duration_ms', name: 'catalog_repair_aggregate' },
  { key: 'actionable_missing_aggregate_duration_ms', name: 'actionable_missing_aggregate' },
  { key: 'false_exclusion_sale_identity_duration_ms', name: 'false_exclusion_sale_identity' },
  { key: 'bootstrap_checks_duration_ms', name: 'bootstrap_checks' },
  { key: 'coverage_unattributed_duration_ms', name: 'coverage_unattributed' },
]

export function buildIngestionDiagnosticsPerformance(
  input: BuildIngestionDiagnosticsPerformanceInput
): IngestionDiagnosticsPerformance {
  const routeSpans: TimedSpan[] = [
    { name: 'core_metrics', durationMs: input.coreMetricsDurationMs },
    { name: 'diagnostics_metrics', durationMs: input.diagnosticsMetricsDurationMs },
    { name: 'coverage_scoreboard', durationMs: input.coverageScoreboardDurationMs },
  ]

  const singleSpans: TimedSpan[] = [
    ...routeSpans,
    { name: 'merge', durationMs: input.mergeDurationMs },
    { name: 'model_build', durationMs: input.modelBuildDurationMs },
    ...COVERAGE_SPAN_KEYS.map(({ key, name }) => ({
      name,
      durationMs: input.coverage[key],
    })),
  ]

  return {
    total_duration_ms: input.totalDurationMs,
    api_route_duration_ms: input.apiRouteDurationMs,
    core_metrics_duration_ms: input.coreMetricsDurationMs,
    diagnostics_metrics_duration_ms: input.diagnosticsMetricsDurationMs,
    coverage_scoreboard_duration_ms: input.coverageScoreboardDurationMs,
    merge_duration_ms: input.mergeDurationMs,
    model_build_duration_ms: input.modelBuildDurationMs,
    json_payload_bytes: input.jsonPayloadBytes,
    cache_status: 'none',
    generated_at: input.generatedAt,
    coverage: input.coverage,
    write_count: input.writeCounter.total,
    sequential_write_count: input.writeCounter.sequential,
    write_tables: input.writeCounter.getTables(),
    ...deriveRouteWallClockSlowest(routeSpans),
    ...deriveSingleSpanSlowest(singleSpans),
  }
}

export type MutableCoveragePerformance = {
  missing_valid_list_duration_ms: number
  false_exclusion_trace_duration_ms: number
  false_exclusion_persist_duration_ms: number
  false_exclusion_format_duration_ms: number
  coverage_parallel_block_duration_ms: number
  shadow_replay_duration_ms: number
  shadow_replay_persist_duration_ms: number
  coverage_observation_aggregate_duration_ms: number
  existing_refresh_aggregate_duration_ms: number
  catalog_repair_aggregate_duration_ms: number
  actionable_missing_aggregate_duration_ms: number
  false_exclusion_sale_identity_duration_ms: number
  bootstrap_checks_duration_ms: number
  coverage_unattributed_duration_ms: number
}

export function emptyCoveragePerformance(): MutableCoveragePerformance {
  return {
    missing_valid_list_duration_ms: 0,
    false_exclusion_trace_duration_ms: 0,
    false_exclusion_persist_duration_ms: 0,
    false_exclusion_format_duration_ms: 0,
    coverage_parallel_block_duration_ms: 0,
    shadow_replay_duration_ms: 0,
    shadow_replay_persist_duration_ms: 0,
    coverage_observation_aggregate_duration_ms: 0,
    existing_refresh_aggregate_duration_ms: 0,
    catalog_repair_aggregate_duration_ms: 0,
    actionable_missing_aggregate_duration_ms: 0,
    false_exclusion_sale_identity_duration_ms: 0,
    bootstrap_checks_duration_ms: 0,
    coverage_unattributed_duration_ms: 0,
  }
}
