import type { MutableCoveragePerformance } from '@/lib/admin/diagnostics/v4/performance/buildDiagnosticsPerformance'

export type CoverageScoreboardPerformanceSink = {
  readonly writeCounter: DiagnosticsWriteCounter
  readonly coverage: MutableCoveragePerformance
}
