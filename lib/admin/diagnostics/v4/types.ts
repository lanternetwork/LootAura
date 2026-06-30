import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export type DiagnosticsExportMode = 'operations' | 'engineering' | 'full'

export type OperationalDomain =
  | 'system_health'
  | 'slos'
  | 'pipeline'
  | 'discovery'
  | 'parsing'
  | 'geocoding'
  | 'publishing'
  | 'catalog_repair'
  | 'visibility_coverage'
  | 'duplicate_detection'
  | 'backlog_queues'
  | 'scheduler_cron'
  | 'external_providers'
  | 'data_quality'
  | 'alerts'
  | 'controls'
  | 'engineering'

export type SystemHealthLevel = 'healthy' | 'degraded' | 'critical'

export type TrendDirection = 'up' | 'down' | 'flat' | 'unavailable'

export type DiagnosticRegistryEntry = {
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly operationalDomain: OperationalDomain
  readonly owner: string
  readonly operational: boolean
  readonly sloParticipation: boolean
  readonly blockingSlo: boolean
  readonly exportModes: readonly DiagnosticsExportMode[]
  readonly runbookReference: string | null
}

export type SloEvaluationRow = {
  readonly id: string
  readonly label: string
  readonly pass: boolean
  readonly actual: string
  readonly target: string
  readonly blocking: boolean
}

export type ResolvedBottleneck = {
  readonly id: string
  readonly label: string
  readonly reason: string
  readonly domain: OperationalDomain
  readonly rawBottleneck: string
}

export type OperatorAction = {
  readonly severity: 'critical' | 'warning' | 'info'
  readonly issue: string
  readonly action: string
  readonly owner: string
}

export type ComputedAlert = {
  readonly id: string
  readonly severity: 'critical' | 'warning' | 'info'
  readonly reason: string
  readonly affectedMetricIds: readonly string[]
  readonly owner: string
  readonly recommendedAction: string
}

export type TrendSnapshot = {
  readonly direction: TrendDirection
  readonly label24h: string
  readonly label7d: string
}

export type SchedulerCronRow = {
  readonly id: string
  readonly displayName: string
  readonly owner: string
  readonly expectedCadenceMinutes: number | null
  readonly lastSuccessAt: string | null
  readonly minutesSinceSuccess: number | null
  readonly state: 'ok' | 'stale' | 'crash_loop' | 'unknown'
  readonly failureCount24h: number | null
  readonly crashLoopDetected: boolean
}

export type PipelineStageSnapshot = {
  readonly stage: string
  readonly count24h: number
  readonly available: boolean
}

export type CatalogRepairSnapshot = {
  readonly queueTotal: number
  readonly needsCheck: number
  readonly needsGeocode: number
  readonly publishFailed: number
  readonly repairFailed: number
  readonly addressEnrichment: number
  readonly dominantBlocker: string | null
  readonly recommendation: string
}

export type VisibilitySnapshot = {
  readonly observationStale: number
  readonly trueVisibilityFailure: number
  readonly publishedNotVisibleTotal: number
}

export type DuplicateHealthSnapshot = {
  readonly canonicalPublishClusters: number
  readonly convergenceStreakDays: number
  readonly convergenceStreakTargetDays: number
  readonly visibleDuplicateClusters: number
  readonly visibleDuplicateRate: number | null
  readonly shadowDivergenceCount: number
}

export type BacklogSnapshot = {
  readonly catalogRepair: number
  readonly publishFailed: number
  readonly geocodeEligible: number
  readonly geocodeBacklog: number
  readonly addressEnrichment: number
  readonly refreshStale: number
  readonly imageBacklog: number
  readonly missingIngest: number
}

export type SeoReadinessSnapshot = {
  readonly metricGatePass: boolean
  readonly criteria: ReadonlyArray<{ label: string; pass: boolean; actual: string }>
}

export type IngestionDiagnosticsModel = {
  readonly diagnosticsModelVersion: string
  readonly generatedAt: string
  readonly environment: string
  readonly metrics: IngestionMetricsResponse
  readonly coverage: YstmCoverageMetricsResponse | null
  readonly registry: readonly DiagnosticRegistryEntry[]
  readonly systemHealth: SystemHealthLevel
  readonly primaryBottleneck: ResolvedBottleneck
  readonly operatorActions: readonly OperatorAction[]
  readonly alerts: readonly ComputedAlert[]
  readonly slos: readonly SloEvaluationRow[]
  readonly blockingSloFailures: readonly SloEvaluationRow[]
  readonly trendSummary: string
  readonly pipeline: readonly PipelineStageSnapshot[]
  readonly catalogRepair: CatalogRepairSnapshot
  readonly visibility: VisibilitySnapshot
  readonly duplicates: DuplicateHealthSnapshot
  readonly backlogs: BacklogSnapshot
  readonly schedulerCrons: readonly SchedulerCronRow[]
  readonly seoReadiness: SeoReadinessSnapshot | null
}

export type BuildIngestionDiagnosticsModelInput = {
  readonly metrics: IngestionMetricsResponse
  readonly coverage: YstmCoverageMetricsResponse | null
  readonly environment?: string
  readonly generatedAt?: string
}
