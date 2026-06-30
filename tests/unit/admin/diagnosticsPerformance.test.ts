import { describe, expect, it } from 'vitest'
import {
  buildIngestionDiagnosticsPerformance,
  emptyCoveragePerformance,
} from '@/lib/admin/diagnostics/v4/performance/buildDiagnosticsPerformance'
import {
  deriveRouteWallClockSlowest,
  deriveSingleSpanSlowest,
} from '@/lib/admin/diagnostics/v4/performance/deriveSlowestStage'
import { DiagnosticsWriteCounter } from '@/lib/admin/diagnostics/v4/performance/writeCounter'
import { buildDiagnosticsExport } from '@/lib/admin/diagnostics/v4/export/buildDiagnosticsExport'
import { buildDiagnosticsPerformanceSection } from '@/lib/admin/diagnostics/v4/export/buildDiagnosticsPerformanceSection'
import { buildIngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/buildIngestionDiagnosticsModel'
import {
  diagnosticsV4Coverage,
  diagnosticsV4Metrics,
} from '@/tests/unit/admin/diagnosticsV4Fixtures'
import type { IngestionDiagnosticsPerformance } from '@/lib/admin/diagnostics/v4/types'

function samplePerformance(): IngestionDiagnosticsPerformance {
  const coverage = emptyCoveragePerformance()
  coverage.false_exclusion_persist_duration_ms = 9000
  const writeCounter = new DiagnosticsWriteCounter()
  writeCounter.recordUpdate('ystm_coverage_observations', { sequential: true })
  writeCounter.recordUpdate('ystm_coverage_observations', { sequential: true })
  writeCounter.recordUpsertBatch('ystm_sale_instance_shadow_replays', 1)

  return buildIngestionDiagnosticsPerformance({
    generatedAt: '2026-06-17T12:00:00.000Z',
    apiRouteDurationMs: 5000,
    totalDurationMs: 4800,
    coreMetricsDurationMs: 800,
    diagnosticsMetricsDurationMs: 1500,
    coverageScoreboardDurationMs: 4200,
    mergeDurationMs: 1,
    modelBuildDurationMs: 2,
    jsonPayloadBytes: 2048,
    coverage,
    writeCounter,
  })
}

describe('diagnostics performance instrumentation', () => {
  describe('deriveSlowestStage', () => {
    it('picks route wall clock winner among parallel legs', () => {
      const result = deriveRouteWallClockSlowest([
        { name: 'core_metrics', durationMs: 800 },
        { name: 'diagnostics_metrics', durationMs: 1500 },
        { name: 'coverage_scoreboard', durationMs: 4200 },
      ])
      expect(result).toEqual({
        slowest_stage: 'coverage_scoreboard',
        slowest_stage_duration_ms: 4200,
        slowest_stage_kind: 'route_wall_clock',
      })
    })

    it('picks single span max across overlapping spans', () => {
      const result = deriveSingleSpanSlowest([
        { name: 'coverage_scoreboard', durationMs: 4200 },
        { name: 'false_exclusion_persist', durationMs: 9000 },
      ])
      expect(result).toEqual({
        slowest_single_span: 'false_exclusion_persist',
        slowest_single_span_duration_ms: 9000,
      })
    })
  })

  describe('buildIngestionDiagnosticsPerformance', () => {
    it('returns numeric non-negative durations and write counts', () => {
      const perf = samplePerformance()
      expect(perf.total_duration_ms).toBeGreaterThanOrEqual(0)
      expect(perf.core_metrics_duration_ms).toBeGreaterThanOrEqual(0)
      expect(perf.coverage_scoreboard_duration_ms).toBeGreaterThanOrEqual(0)
      expect(perf.write_count).toBe(3)
      expect(perf.sequential_write_count).toBe(2)
      expect(perf.write_tables).toEqual([
        'ystm_coverage_observations',
        'ystm_sale_instance_shadow_replays',
      ])
      expect(perf.cache_status).toBe('none')
      expect(perf.slowest_stage_kind).toBe('route_wall_clock')
      expect(perf.slowest_stage).toBe('coverage_scoreboard')
      expect(perf.slowest_single_span).toBe('false_exclusion_persist')
      expect(perf.slowest_single_span_duration_ms).toBe(9000)
    })
  })

  describe('exports', () => {
    it('includes performance section in operations and engineering exports', () => {
      const base = buildIngestionDiagnosticsModel({
        metrics: diagnosticsV4Metrics(),
        coverage: diagnosticsV4Coverage(),
        environment: 'preview',
      })
      const model = { ...base, performance: samplePerformance() }

      const ops = buildDiagnosticsExport(model, 'operations')
      expect(ops).toContain('## DIAGNOSTICS PERFORMANCE')
      expect(ops).toContain('slowest stage (route wall clock)')
      expect(ops).not.toContain('single span (may overlap)')

      const engineering = buildDiagnosticsExport(model, 'engineering')
      expect(engineering).toContain('### Timing breakdown')
      expect(engineering).toContain('single span (may overlap)')
      expect(engineering).toContain('write count')

      const full = buildDiagnosticsExport(model, 'full')
      expect(full).toContain('## DIAGNOSTICS PERFORMANCE')
    })
  })

  describe('DiagnosticsPerformanceCard content', () => {
    it('operations performance section includes dashboard card fields', () => {
      const section = buildDiagnosticsPerformanceSection(
        {
          ...buildIngestionDiagnosticsModel({
            metrics: diagnosticsV4Metrics(),
            coverage: diagnosticsV4Coverage(),
            environment: 'preview',
          }),
          performance: samplePerformance(),
        },
        'operations'
      )
      expect(section.join('\n')).toContain('total duration')
      expect(section.join('\n')).toContain('4,800 ms')
      expect(section.join('\n')).toContain('coverage_scoreboard')
      expect(section.join('\n')).toContain('json payload size')
    })
  })

  describe('model semantics unchanged', () => {
    it('buildIngestionDiagnosticsModel output is unchanged without performance field', () => {
      const model = buildIngestionDiagnosticsModel({
        metrics: diagnosticsV4Metrics(),
        coverage: diagnosticsV4Coverage(),
        environment: 'production',
      })
      expect(model.performance).toBeUndefined()
      expect(model.systemHealth).toBe('healthy')
      expect(model.slos.length).toBeGreaterThan(0)
    })
  })
})
