import type { IngestionBottleneck } from '@/lib/admin/ingestionVolumeMetricsHelpers'

export interface IngestionMetricsHourlyRates {
  sourcePagesFetchedPerHour: number
  configsProcessedPerHour: number
  listingsDiscoveredPerHour: number
  listingsInsertedPerHour: number
  geocodeSucceededPerHour: number
  geocodeRetryableFailedPerHour: number
  geocodeTerminalFailedPerHour: number
  publishAttemptedPerHour: number
  publishSucceededPerHour: number
  publishFailedPerHour: number
  reconciliationProcessedPerHour: number
}

export interface IngestionVolumeFetchMetrics {
  crawlableConfigsTotal: number
  configsDueForCrawl: number
  configsOverdue: number
  estimatedFullRotationMinutes: number
  sourcePagesFetched24h: number
  configsProcessed24h: number
  listingsDiscovered24h: number
  listingsInserted24h: number
  duplicateSkipRate: number | null
  parserFailureRate: number | null
  fetchFailureRate: number | null
  averageExternalFetchDurationMs: number | null
  budgetExitCount24h: number
}

export interface IngestionVolumeAddressLifecycleMetrics {
  byStatus: Record<string, number>
  enrichmentBacklog: number
}

export interface IngestionVolumeImageEnrichmentMetrics {
  backlog: number
  hasImage: number
  attempted24h: number
  byFailureReason: Record<string, number>
}

export interface IngestionVolumeGeocodeMetrics {
  needsGeocodeCount: number
  /** Rows claimable by geocode RPC (address_available + non-empty address_raw). */
  eligibleNeedsGeocodeCount: number
  oldestNeedsGeocodeAgeMs: number | null
  geocodeSucceeded24h: number
  geocodeRetryableFailed24h: number
  geocodeTerminalFailed24h: number
  rate429Count24h: number
  effectiveConcurrencyLatest: number | null
}

export interface IngestionVolumePublishMetrics {
  readyCount: number
  oldestReadyAgeMs: number | null
  publishAttempted24h: number
  publishSucceeded24h: number
  publishFailed24h: number
  duplicateReuseCount24h: number
}

export interface IngestionVolumeDiscoveryMetrics {
  pendingConfigs: number
  validatedConfigs: number
  failedConfigs: number
  crawlExcludedConfigs: number
  promotedConfigs24h: number
  repairedConfigs24h: number
}

export interface IngestionVolumeReconciliationMetrics {
  candidatePageRpcOkRate24h: number | null
  candidatesProcessed24h: number
  scheduleMutationInhibited24h: number
  salesSyncUpdated24h: number
}

export interface IngestionVolumeMetrics {
  fetch: IngestionVolumeFetchMetrics
  addressLifecycle: IngestionVolumeAddressLifecycleMetrics
  imageEnrichment: IngestionVolumeImageEnrichmentMetrics
  geocode: IngestionVolumeGeocodeMetrics
  publish: IngestionVolumePublishMetrics
  discovery: IngestionVolumeDiscoveryMetrics
  reconciliation: IngestionVolumeReconciliationMetrics
  bottleneck: IngestionBottleneck
  hourlyRates: IngestionMetricsHourlyRates
}

export interface IngestionMetricsStuckRowSample {
  id: string
  status: string
  city: string | null
  state: string | null
  geocode_attempts: number | null
  created_at: string
  updated_at: string
  last_geocode_attempt_at: string | null
}

export interface IngestionMetricsResponse {
  ok: boolean
  generatedAt: string
  backlog: number
  /** needs_geocode rows eligible for geocode claim (address_available + address_raw). */
  geocodeEligibleBacklog: number
  published24h: number
  claimed24h: number
  geocodeTouches24h: number
  efficiency: number | null
  failureBreakdown: {
    needs_check: number
    publish_failed: number
    expired: number
    ready: number
    publishing: number
  }
  timeseries: {
    publishedByHour: Array<{ bucket: string; count: number }>
    ingestedPublishedByHour: Array<{ bucket: string; count: number }>
    durationMsByHour: Array<{ bucket: string; value: number }>
    rate429ByHour: Array<{ bucket: string; count: number }>
    claimedByHour: Array<{ bucket: string; count: number }>
    geocodeSuccessByHour: Array<{ bucket: string; count: number }>
    publishSuccessByHour: Array<{ bucket: string; count: number }>
    publishExpiredByHour: Array<{ bucket: string; count: number }>
    sourcePagesFetchedByHour: Array<{ bucket: string; count: number }>
    configsProcessedByHour: Array<{ bucket: string; count: number }>
    listingsInsertedByHour: Array<{ bucket: string; count: number }>
    publishFailedByHour: Array<{ bucket: string; count: number }>
    geocodeRetryableFailedByHour: Array<{ bucket: string; count: number }>
  }
  orchestrationVisibility: {
    lockSkippedRuns48h: number
    budgetExitRuns48h: number
    overlapPreventionEvents48h: number
    adaptiveLatest: Record<string, unknown> | null
    laneModeEnabled: boolean
    lanes: Array<{
      laneKey: string
      laneType: string
      laneRegion: string | null
      stateKey: string
      cursor: number
    }>
  }
  volume: IngestionVolumeMetrics
  oldestStuckRows: IngestionMetricsStuckRowSample[]
}
