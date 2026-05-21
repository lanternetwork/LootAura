import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export type DiscoveryCronTelemetry = {
  statesScanned: number
  stateCursorBefore: number
  stateCursorAfter: number
  catalogSize: number
  candidatePagesDiscovered: number
  candidatePagesValid: number
  candidatePagesInvalid: number
  candidateRegistryUpserts: number
  graphEnumerationValidations: number
  graphEnumerationThrottled: boolean
  configsPromoted: number
  configsRepaired: number
  /** Phase 2: configs that gained source_pages from placeholder repair pass. */
  placeholderRepairRepaired: number
  placeholderRepairFailed: number
  configsRevalidated: number
  configsFailed: number
  placeholdersUnresolved: number
  crawlableConfigCount: number
  failedConfigCount: number
  crawlExcludedConfigCount: number
  discoveryLatencyMs: number
  repairRate: number
  overlapPrevented: boolean
  staleLockRecovered: boolean
  degraded: boolean
  phasesCompleted: string[]
}

export function createDiscoveryCronTelemetry(): DiscoveryCronTelemetry {
  return {
    statesScanned: 0,
    stateCursorBefore: 0,
    stateCursorAfter: 0,
    catalogSize: 0,
    candidatePagesDiscovered: 0,
    candidatePagesValid: 0,
    candidatePagesInvalid: 0,
    candidateRegistryUpserts: 0,
    graphEnumerationValidations: 0,
    graphEnumerationThrottled: false,
    configsPromoted: 0,
    configsRepaired: 0,
    placeholderRepairRepaired: 0,
    placeholderRepairFailed: 0,
    configsRevalidated: 0,
    configsFailed: 0,
    placeholdersUnresolved: 0,
    crawlableConfigCount: 0,
    failedConfigCount: 0,
    crawlExcludedConfigCount: 0,
    discoveryLatencyMs: 0,
    repairRate: 0,
    overlapPrevented: false,
    staleLockRecovered: false,
    degraded: false,
    phasesCompleted: [],
  }
}

export function computeRepairRate(repaired: number, revalidated: number): number {
  const denominator = revalidated + repaired
  if (denominator <= 0) return 0
  return Math.round((repaired / denominator) * 1000) / 1000
}

export function emitDiscoveryCronCompleted(
  telemetry: DiscoveryCronTelemetry,
  fields: Record<string, unknown> = {}
): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.discovery.cronCompleted, {
      ...telemetry,
      ...fields,
    })
  )
}
