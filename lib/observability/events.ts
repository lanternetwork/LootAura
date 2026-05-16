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
    duplicateScoringDecision: 'ingestion.duplicate.scoring_decision',
    orchestrationLeaseOutcome: 'ingestion.orchestration.lease_outcome',
  },
  geocode: {
    batchStarted: 'geocode.worker.batch_started',
    batchCompleted: 'geocode.worker.batch_completed',
    claimEmpty: 'geocode.worker.claim_empty',
    queueBatchCompleted: 'geocode.queue.batch_completed',
    providerHealthClassified: 'geocode.provider.health_classified',
    deadLetterClassified: 'geocode.dead_letter.classified',
    deadLetterReplayed: 'geocode.dead_letter.replayed',
    /** Aggregate only: DB update failures + lost races during bounded replay (no row ids). */
    deadLetterReplayPartialFailures: 'geocode.dead_letter.replay_partial_failures',
    replayExhausted: 'geocode.replay.exhausted',
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
    sourceDegraded: 'parser.source.degraded',
    sourceFailing: 'parser.source.failing',
    sourceRecovered: 'parser.source.recovered',
    fixtureStale: 'parser.fixture.stale',
    /** Fixture vs parse mismatch (no PII in payload; use fixture ids only). */
    regressionMismatch: 'parser.regression.fixture_mismatch',
  },
  api: {
    salesGetLatency: 'api.sales.get.latency',
    salesSearchLatency: 'api.sales.search.latency',
    salesMarkersLatency: 'api.sales.markers.latency',
    cronDailyHit: 'api.cron.daily.hit',
    cronGeocodeHit: 'api.cron.geocode.hit',
    adminArchiveTriggerHit: 'api.admin.archive.trigger.hit',
  },
  discovery: {
    runStarted: 'source.discovery.run_started',
    runCompleted: 'source.discovery.run_completed',
    pageDiscovered: 'source.discovery.page_discovered',
    pageValidated: 'source.discovery.page_validated',
    pageValidationFailed: 'source.discovery.page_validation_failed',
  },
  reconciliation: {
    started: 'source.reconciliation.started',
    completed: 'source.reconciliation.completed',
    changed: 'source.reconciliation.changed',
    noChange: 'source.reconciliation.no_change',
    failed: 'source.reconciliation.failed',
    /** Aggregate-only run summary (Phase 1B runner; no per-row payloads). */
    runSummary: 'source.reconciliation.run_summary',
    /** Candidate page RPC failure (aggregate; errorCode only, no row ids). */
    candidatePageRpcFailure: 'source.reconciliation.candidate_page.rpc_failure',
    /** Phase 2A aggregate: public sale rows updated (counts only). */
    salesSyncApplied: 'source.reconciliation.sales_sync_applied',
    /** Phase 2A aggregate: sale sync attempts that did not persist (counts only). */
    salesSyncSkipped: 'source.reconciliation.sales_sync_skipped',
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
  | (typeof ObservabilityEvents.discovery)[keyof typeof ObservabilityEvents.discovery]
  | (typeof ObservabilityEvents.reconciliation)[keyof typeof ObservabilityEvents.reconciliation]
