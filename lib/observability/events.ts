/**
 * Centralized observability event names (Tier 0 — structured logs, no vendor metrics).
 * Use these instead of ad-hoc strings so log aggregators can alert and dashboard consistently.
 */

export const ObservabilityEvents = {
  ingestion: {
    orchestrationStarted: 'ingestion.orchestration.started',
    orchestrationCompleted: 'ingestion.orchestration.completed',
    orchestrationStep: 'ingestion.orchestration.step',
    externalPersistSummary: 'ingestion.external_page_source.persist_summary',
    externalFetchFailed: 'ingestion.external_page_source.fetch_failed',
    externalParseFailed: 'ingestion.external_page_source.parse_failed',
    externalZeroListings: 'ingestion.external_page_source.zero_listings_page',
  },
  geocode: {
    batchStarted: 'geocode.worker.batch_started',
    batchCompleted: 'geocode.worker.batch_completed',
    claimEmpty: 'geocode.worker.claim_empty',
    queueBatchCompleted: 'geocode.queue.batch_completed',
  },
  publish: {
    batchCompleted: 'publish.worker.batch_completed',
    rowProcessed: 'publish.worker.row_processed',
  },
  archive: {
    batchIteration: 'archive.sales.batch_iteration',
    jobSummary: 'archive.sales.job_summary',
    stalePending: 'archive.sales.stale_pending_after_job',
    maxIterations: 'archive.sales.max_iterations',
  },
  queue: {
    pressure: 'queue.pressure',
    starvationSignal: 'queue.starvation_signal',
  },
  retry: {
    classification: 'retry.classification',
  },
  parser: {
    extractionFailure: 'parser.source.extraction_failure',
    persistComplete: 'parser.source.persist_complete',
    normalizationWarning: 'parser.source.normalization_warning',
    parseTimed: 'parser.source.parse_timed',
    duplicateSuppressed: 'parser.source.duplicate_suppressed',
  },
  api: {
    salesGetLatency: 'api.sales.get.latency',
    salesSearchLatency: 'api.sales.search.latency',
    salesMarkersLatency: 'api.sales.markers.latency',
    cronDailyHit: 'api.cron.daily.hit',
    cronGeocodeHit: 'api.cron.geocode.hit',
    adminArchiveTriggerHit: 'api.admin.archive.trigger.hit',
  },
} as const

export type ObservabilityEventName =
  | (typeof ObservabilityEvents.ingestion)[keyof typeof ObservabilityEvents.ingestion]
  | (typeof ObservabilityEvents.geocode)[keyof typeof ObservabilityEvents.geocode]
  | (typeof ObservabilityEvents.publish)[keyof typeof ObservabilityEvents.publish]
  | (typeof ObservabilityEvents.archive)[keyof typeof ObservabilityEvents.archive]
  | (typeof ObservabilityEvents.queue)[keyof typeof ObservabilityEvents.queue]
  | (typeof ObservabilityEvents.retry)[keyof typeof ObservabilityEvents.retry]
  | (typeof ObservabilityEvents.parser)[keyof typeof ObservabilityEvents.parser]
  | (typeof ObservabilityEvents.api)[keyof typeof ObservabilityEvents.api]
