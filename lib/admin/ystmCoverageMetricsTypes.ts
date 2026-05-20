import type { YstmCoverageScoreboard } from '@/lib/admin/ystmCoverageScoreboard'

export type YstmCoverageMetricsResponse = {
  ok: true
} & YstmCoverageScoreboard
