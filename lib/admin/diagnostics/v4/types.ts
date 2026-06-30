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

export type AlertConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export type VisibilityClassificationMode = 'FULL_POPULATION' | 'SAMPLE_ONLY' | 'UNAVAILABLE'

export type BottleneckType =
  | 'HOT_PATH_BLOCKER'
  | 'BACKLOG_PRESSURE'
  | 'VISIBILITY_RECONCILIATION'
  | 'DUPLICATE_REVIEW'
  | 'CONVERGENCE_MATURITY'
  | 'SEO_PRODUCT_GATE'
  | 'ENGINEERING_ROLLOUT'
  | 'UNKNOWN'

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

export type SecondaryPressure = {
  readonly id: string
  readonly label: string
  readonly count: number
}

export type ResolvedBottleneck = {
  readonly id: string
  readonly label: string
  readonly reason: string
  readonly domain: OperationalDomain
  readonly type: BottleneckType
  readonly rawBottleneck: string
  readonly secondaryPressures: readonly SecondaryPressure[]
}

export type HealthReason = {
  readonly id: string
  readonly label: string
  readonly domain: OperationalDomain
}

export type SystemHealthAssessment = {
  readonly level: SystemHealthLevel
  readonly reasons: readonly HealthReason[]
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
  readonly domain: OperationalDomain
  readonly trigger: string
  readonly reason: string
  readonly currentValue: string
  readonly threshold: string
  readonly confidence: AlertConfidence
  readonly affectedMetricIds: readonly string[]
  readonly owner: string
  readonly recommendedAction: string
  readonly blockingUserImpact: boolean
}

export type DomainHealthRow = {
  readonly id: string
  readonly label: string
  readonly domain: OperationalDomain
  readonly status: SystemHealthLevel
  readonly primaryReason: string
  readonly currentMetric: string
  readonly threshold: string
  readonly owner: string
  readonly recommendedAction: string
}

export type MetricAttribution = {
  readonly source: string
  readonly computedBy: string
  readonly freshness: string
  readonly confidence: AlertConfidence
}

export type TrendSnapshot = {
  readonly direction: TrendDirection
  readonly label24h: string
  readonly label7d: string
}

export type SchedulerCronState = 'ok' | 'late' | 'failed' | 'crash_loop' | 'unknown'

export type SchedulerCronRow = {
  readonly id: string
  readonly displayName: string
  readonly owner: string
  readonly expectedCadenceMinutes: number | null
  readonly lastStartedAt: string | null
  readonly lastCompletedAt: string | null
  readonly lastSuccessAt: string | null
  readonly lastErrorAt: string | null
  readonly lastErrorCode: string | null
  readonly durationMs: number | null
  readonly minutesSinceSuccess: number | null
  readonly state: SchedulerCronState
  readonly failureCount24h: number | null
  readonly crashLoopDetected: boolean
  readonly telemetryUnavailableReason: string | null
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
  readonly publishedNotVisibleTotal: number
  readonly auditedCount: number
  readonly auditedCoveragePct: number | null
  readonly observationStaleCount: number
  readonly trueVisibilityFailureCount: number
  readonly unknownUnclassifiedCount: number
  readonly classificationConfidence: AlertConfidence
  readonly classificationMode: VisibilityClassificationMode
  readonly attribution: MetricAttribution
  /** @deprecated use observationStaleCount */
  readonly observationStale: number
  /** @deprecated use trueVisibilityFailureCount */
  readonly trueVisibilityFailure: number
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
  readonly healthReasons: readonly HealthReason[]
  readonly domainHealth: readonly DomainHealthRow[]
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
