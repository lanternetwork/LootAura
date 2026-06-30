import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { IngestionDiagnosticsModel, IngestionDiagnosticsPerformance } from '@/lib/admin/diagnostics/v4/types'

export type DiagnosticsPerformanceExportMode = 'operations' | 'engineering'

function formatPayloadBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(2)} MB (${bytes.toLocaleString()} bytes)`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB (${bytes.toLocaleString()} bytes)`
  }
  return `${bytes.toLocaleString()} bytes`
}

function buildOperationsPerformanceLines(perf: IngestionDiagnosticsPerformance): string[] {
  return [
    '## DIAGNOSTICS PERFORMANCE',
    diagnosticBullet('total duration', `${perf.total_duration_ms.toLocaleString()} ms`),
    diagnosticBullet(
      'slowest stage (route wall clock)',
      `${perf.slowest_stage} (${perf.slowest_stage_duration_ms.toLocaleString()} ms)`
    ),
    diagnosticBullet('cache status', perf.cache_status),
    diagnosticBullet('json payload size', formatPayloadBytes(perf.json_payload_bytes)),
    '',
  ]
}

function buildFullPerformanceLines(perf: IngestionDiagnosticsPerformance): string[] {
  const lines = [
    ...buildOperationsPerformanceLines(perf),
    '### Timing breakdown',
    diagnosticBullet('api route duration', `${perf.api_route_duration_ms.toLocaleString()} ms`),
    diagnosticBullet('core metrics', `${perf.core_metrics_duration_ms.toLocaleString()} ms`),
    diagnosticBullet('diagnostics metrics', `${perf.diagnostics_metrics_duration_ms.toLocaleString()} ms`),
    diagnosticBullet('coverage scoreboard', `${perf.coverage_scoreboard_duration_ms.toLocaleString()} ms`),
    diagnosticBullet('merge', `${perf.merge_duration_ms.toLocaleString()} ms`),
    diagnosticBullet('model build', `${perf.model_build_duration_ms.toLocaleString()} ms`),
    '',
    '### Coverage substeps',
    diagnosticBullet(
      'missing valid list',
      `${perf.coverage.missing_valid_list_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'false exclusion trace',
      `${perf.coverage.false_exclusion_trace_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'false exclusion persist',
      `${perf.coverage.false_exclusion_persist_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'false exclusion format',
      `${perf.coverage.false_exclusion_format_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'coverage parallel block',
      `${perf.coverage.coverage_parallel_block_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'shadow replay (compute)',
      `${perf.coverage.shadow_replay_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'shadow replay persist',
      `${perf.coverage.shadow_replay_persist_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'coverage observation aggregate',
      `${perf.coverage.coverage_observation_aggregate_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'existing refresh aggregate',
      `${perf.coverage.existing_refresh_aggregate_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'catalog repair aggregate',
      `${perf.coverage.catalog_repair_aggregate_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'actionable missing aggregate',
      `${perf.coverage.actionable_missing_aggregate_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'false exclusion sale identity',
      `${perf.coverage.false_exclusion_sale_identity_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'bootstrap checks',
      `${perf.coverage.bootstrap_checks_duration_ms.toLocaleString()} ms`
    ),
    diagnosticBullet(
      'coverage unattributed',
      `${perf.coverage.coverage_unattributed_duration_ms.toLocaleString()} ms`
    ),
    '',
    '### Write activity',
    diagnosticBullet('write count', perf.write_count.toLocaleString()),
    diagnosticBullet('sequential write count', perf.sequential_write_count.toLocaleString()),
    diagnosticBullet('write tables', perf.write_tables.length > 0 ? perf.write_tables.join(', ') : 'none'),
    '',
    '### Slowest spans',
    diagnosticBullet(
      'route wall clock',
      `${perf.slowest_stage} (${perf.slowest_stage_duration_ms.toLocaleString()} ms)`
    ),
    diagnosticBullet(
      'single span (may overlap)',
      `${perf.slowest_single_span} (${perf.slowest_single_span_duration_ms.toLocaleString()} ms)`
    ),
    '',
  ]
  return lines
}

export function buildDiagnosticsPerformanceSection(
  model: IngestionDiagnosticsModel,
  mode: DiagnosticsPerformanceExportMode
): string[] {
  const perf = model.performance
  if (!perf) {
    return [
      '## DIAGNOSTICS PERFORMANCE',
      diagnosticBullet('status', 'unavailable (instrumentation not present on this model)'),
      '',
    ]
  }
  if (mode === 'operations') {
    return buildOperationsPerformanceLines(perf)
  }
  return buildFullPerformanceLines(perf)
}
