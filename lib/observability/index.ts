export { ObservabilityEvents, type ObservabilityEventName } from './events'
export { createCorrelationBundle, mergeCorrelation, type CorrelationBundle, type CorrelationFields } from './correlation'
export {
  classifyQueuePressure,
  classifyRetryExhaustion,
  createDurationTimer,
  elapsedMsSince,
  staleAgeMsFromIso,
  type DurationTimer,
  type QueuePressureClass,
  type RetryExhaustionClass,
} from './metrics'
export {
  buildTelemetryRecord,
  emitObservabilityRecord,
  shouldEmitTelemetryJson,
  type TelemetryRecord,
} from './emit'
export {
  evaluateIngestionHealth,
  defaultIngestionHealthThresholds,
  type IngestionHealthEvaluation,
  type IngestionHealthReason,
  type IngestionHealthSignalKey,
  type IngestionHealthSignals,
  type IngestionHealthStatus,
  type IngestionHealthThresholds,
} from './ingestionHealth'
export {
  fingerprintIngestionHealth,
  reportIngestionHealthEvaluation,
  resetIngestionHealthReporterForTests,
} from './reportIngestionHealth'
export {
  buildIngestionHealthThresholdsForWiring,
  collectIngestionHealthSignals,
  loadIngestionHealthThresholdsFromEnv,
  runIngestionHealthPipeline,
  type RunIngestionHealthPipelineResult,
} from './ingestionHealthWiring'
