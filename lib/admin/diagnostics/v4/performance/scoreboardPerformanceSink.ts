import type { MutableCoveragePerformance } from '@/lib/admin/diagnostics/v4/performance/buildDiagnosticsPerformance'
import type { DiagnosticsWriteCounter } from '@/lib/admin/diagnostics/v4/performance/writeCounter'

export type CoverageScoreboardPerformanceSink = {
  readonly writeCounter: DiagnosticsWriteCounter
  readonly coverage: MutableCoveragePerformance
}
