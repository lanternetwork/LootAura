import type { NeedsCheckBreakdown } from '@/lib/admin/countNeedsCheckBreakdown'
import type { NeedsCheckRootCauseAnalysis } from '@/lib/admin/needsCheckRootCauseTypes'
import type { ListFastFailureDistributionAnalysis } from '@/lib/admin/listFastFailureDistributionTypes'
import type { PublishedNotVisibleDistributionDiscovery } from '@/lib/admin/publishedNotVisibleDistributionTypes'
import type { AddressEnrichmentDrainCohortAnalysis } from '@/lib/ingestion/address/addressEnrichmentDrainTypes'
import type { IngestionBottleneck } from '@/lib/admin/ingestionVolumeMetricsHelpers'

export type { NeedsCheckBreakdown } from '@/lib/admin/countNeedsCheckBreakdown'
export type { NeedsCheckRootCauseAnalysis } from '@/lib/admin/needsCheckRootCauseTypes'
export type { ListFastFailureDistributionAnalysis } from '@/lib/admin/listFastFailureDistributionTypes'
export type { PublishedNotVisibleDistributionDiscovery } from '@/lib/admin/publishedNotVisibleDistributionTypes'
export type { AddressEnrichmentDrainCohortAnalysis } from '@/lib/ingestion/address/addressEnrichmentDrainTypes'
import type { DetailFirstProofEvaluation } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import type {
  ConfigYieldLeaderboardEntry,
  CrawlSkipTaxonomyRollup,
  IngestionFunnelDuplicateHits,
  IngestionFunnelFreshRates,
  IngestionFunnelPlatformBreakdown,
  IngestionFunnelReconciliation,
  IngestionFunnelStage,
  IngestionFunnelTopDropoff,
  IngestionFunnelWindowMetrics,
} from '@/lib/admin/ingestionFunnelMetricsHelpers'
import type { DetailFirstOperationalAlert } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

export type { DetailFirstProofEvaluation } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'

export type {
  ConfigYieldLeaderboardEntry,
  CrawlSkipTaxonomyRollup,
  IngestionFunnelDuplicateHits,
  IngestionFunnelFreshRates,
  IngestionFunnelPlatformBreakdown,
  IngestionFunnelReconciliation,
  IngestionFunnelStage,
  IngestionFunnelTopDropoff,
  IngestionFunnelWindowMetrics,
}

export type IngestionFunnelMetrics = {
  '24h': IngestionFunnelWindowMetrics
  '7d': IngestionFunnelWindowMetrics
}

export interface IngestionMetricsHourlyRates {
  sourcePagesFetchedPerHour: number
  configsProcessedPerHour: number
  listingsDiscoveredPerHour: number
  listingsInsertedPerHour: number
  listingsSkippedPerHour: number
  insertYieldPerHour: number | null
  saturationRatePerHour: number | null
  geocodeSucceededPerHour: number
  geocodeRetryableFailedPerHour: number
  geocodeTerminalFailedPerHour: number
  publishAttemptedPerHour: number
  publishSucceededPerHour: number
  publishFailedPerHour: number
  reconciliationProcessedPerHour: number
}

export interface IngestionVolumeAcquisitionMetrics {
  insertYield24h: number | null
  saturationRate24h: number | null
  enabledExternalConfigs: number
  crawlableConfigs: number
  configsSkippedNoSourcePages: number
  configsSkippedInvalidUrls: number
  saturatedConfigs: number
  configsWithRecentInsert: number
  avgConfigWindowInsertYield: number | null
  pendingDiscoveryConfigs: number
  validatedDiscoveryConfigs: number
  manualDiscoveryConfigs: number
  failedDiscoveryConfigs: number
  discoveryFailureReasons: Record<string, number>
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
  listingsSkipped24h: number
  insertYield24h: number | null
  saturationRate24h: number | null
  duplicateSkipRate: number | null
  parserFailureRate: number | null
  fetchFailureRate: number | null
  averageExternalFetchDurationMs: number | null
  budgetExitCount24h: number
  crawlSkipTaxonomy24h: CrawlSkipTaxonomyRollup
  crawlSkipTaxonomyAlerts: DetailFirstOperationalAlert[]
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

export interface IngestionVolumeNativeCoordMetrics {
  nativeCoordBacklog: number
  nativeCoordClaimEligible: number
  nativeCoordPromoted24h: number
  nativeCoordFallbackToGeocode24h: number
  nativeCoordRetry24h: number
  nativeCoordTerminal24h: number
  readyFromNative24h: number
  publishedFromNative24h: number
  geocodeProviderAvoided24h: number
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
  /** `needs_check` rows eligible for transient-provider dead-letter replay (bounded scan). */
  replayableTransientNeedsCheck: number
  /** Other `needs_check` geocode terminal rows (non-replayable or ineligible). */
  terminalGeocodeNeedsCheck: number
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
  acquisition: IngestionVolumeAcquisitionMetrics
  fetch: IngestionVolumeFetchMetrics
  addressLifecycle: IngestionVolumeAddressLifecycleMetrics
  imageEnrichment: IngestionVolumeImageEnrichmentMetrics
  nativeCoordinateRemediation: IngestionVolumeNativeCoordMetrics
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

export interface TerminalDispositionMetrics {
  terminalActive: number
  terminalArchived: number
  needsCheckLegacyIncludingArchived: number
}

export interface IngestionMetricsResponse {
  ok: boolean
  generatedAt: string
  /** When set, funnel rollups exclude orchestration + cohort rows before this instant. */
  detailFirstMetricsBaselineAt: string | null
  /** Post-deploy proof verdict for Phase 3B (24h funnel, post-baseline when set). */
  detailFirstProof: DetailFirstProofEvaluation
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
  /** needs_check rows grouped by address_status and coordinate_precision (operator triage). */
  needsCheckBreakdown: NeedsCheckBreakdown | null
  /** Workstream A2/B read-only scan — blocker classification inputs for discovery. */
  needsCheckRootCauseAnalysis: NeedsCheckRootCauseAnalysis | null
  /** LIST_FAST_FAILURE_DISTRIBUTION_V1 — hot list-fast failure audit (24h). */
  listFastFailureDistributionAnalysis: ListFastFailureDistributionAnalysis | null
  /** PUBLISHED_NOT_VISIBLE_DISTRIBUTION_V2 — published_not_visible false-exclusion audit. */
  publishedNotVisibleDistributionAnalysis: PublishedNotVisibleDistributionDiscovery | null
  /** Workstreams A–B — address_enrichment_pending × provider_native drain cohort. */
  addressEnrichmentDrainCohort: AddressEnrichmentDrainCohortAnalysis | null
  /** Terminal address disposition inventory (active vs archived). */
  terminalDisposition: TerminalDispositionMetrics | null
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
    listingsSkippedByHour: Array<{ bucket: string; count: number }>
    insertYieldByHour: Array<{ bucket: string; value: number | null }>
    saturationRateByHour: Array<{ bucket: string; value: number | null }>
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
  funnel: IngestionFunnelMetrics
  oldestStuckRows: IngestionMetricsStuckRowSample[]
}
