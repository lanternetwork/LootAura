import { createHash } from 'crypto'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export type DiscoveryTelemetrySnapshot = {
  statesScanned: number
  candidatePagesDiscovered: number
  validPages: number
  invalidPages: number
  duplicatePages: number
  sharedHubPages: number
  validationFetchCount: number
  indexFetchCount: number
}

export function createDiscoveryTelemetry(): DiscoveryTelemetrySnapshot {
  return {
    statesScanned: 0,
    candidatePagesDiscovered: 0,
    validPages: 0,
    invalidPages: 0,
    duplicatePages: 0,
    sharedHubPages: 0,
    validationFetchCount: 0,
    indexFetchCount: 0,
  }
}

export function hashDiscoveryUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

export function emitDiscoveryRunStarted(fields: Record<string, unknown>): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.discovery.runStarted, fields)
  )
}

export function emitDiscoveryRunCompleted(snapshot: DiscoveryTelemetrySnapshot, fields: Record<string, unknown> = {}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.discovery.runCompleted, {
      ...snapshot,
      ...fields,
    })
  )
}

export type DiscoveryPromotionTelemetry = {
  configsPromoted: number
  configsRepaired: number
  malformedCityNamesNormalized: number
  validationsFailed: number
  manualConfigsSkipped: number
  sharedHubMappingsCreated: number
  timezoneUnresolved: number
  inserts: number
  updates: number
  skipped: number
}

export function emitDiscoveryPromotionCompleted(
  telemetry: DiscoveryPromotionTelemetry,
  fields: Record<string, unknown> = {}
): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.discovery.promotionCompleted, {
      ...telemetry,
      ...fields,
    })
  )
}

export function emitDiscoveryPageValidated(fields: {
  stateCode: string
  ok: boolean
  kind?: string
  reason?: string
  sharedHubPage: boolean
  pageUrlHash: string
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(
      fields.ok
        ? ObservabilityEvents.discovery.pageValidated
        : ObservabilityEvents.discovery.pageValidationFailed,
      {
        stateCode: fields.stateCode,
        kind: fields.kind,
        reasonCode: fields.reason,
        sharedHubPage: fields.sharedHubPage,
        pageUrlHash: fields.pageUrlHash,
      }
    )
  )
}
