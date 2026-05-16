import { createHash } from 'crypto'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import type { ReconciliationChangeClass } from '@/lib/reconciliation/types'

export function hashHostForReconciliationTelemetry(hostname: string): string {
  return createHash('sha256').update(hostname.toLowerCase(), 'utf8').digest('hex').slice(0, 16)
}

export function emitReconciliationStarted(fields: {
  readonly batchLimit: number
  readonly candidateCount: number
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.started, {
      ...(fields.telemetryContext ?? {}),
      batchLimit: fields.batchLimit,
      candidateCount: fields.candidateCount,
    })
  )
}

export function emitReconciliationCompleted(fields: {
  readonly processed: number
  readonly changed: number
  readonly unchanged: number
  readonly failed: number
  readonly durationMs: number
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.completed, {
      ...(fields.telemetryContext ?? {}),
      processed: fields.processed,
      changed: fields.changed,
      unchanged: fields.unchanged,
      failed: fields.failed,
      durationMs: fields.durationMs,
    })
  )
}

export function emitReconciliationRowChanged(fields: {
  readonly hostHash: string
  readonly primary: ReconciliationChangeClass
  readonly classCount: number
  readonly durationMs: number
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.changed, {
      ...(fields.telemetryContext ?? {}),
      hostHash: fields.hostHash,
      primary: fields.primary,
      classCount: fields.classCount,
      durationMs: fields.durationMs,
    })
  )
}

export function emitReconciliationRowNoChange(fields: {
  readonly hostHash: string
  readonly durationMs: number
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.noChange, {
      ...(fields.telemetryContext ?? {}),
      hostHash: fields.hostHash,
      durationMs: fields.durationMs,
    })
  )
}

export function emitReconciliationRowFailed(fields: {
  readonly hostHash: string | null
  readonly reason: string
  readonly durationMs: number
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.failed, {
      ...(fields.telemetryContext ?? {}),
      hostHash: fields.hostHash,
      reason: fields.reason,
      durationMs: fields.durationMs,
    })
  )
}

/** Single aggregate line per operator/cron run (no row ids, no URLs). */
export function emitReconciliationRunSummary(fields: {
  readonly runMode: 'dry_run' | 'persist_metadata' | 'persist_metadata_sales_sync'
  readonly dryRun: boolean
  readonly applySafeSync: boolean
  readonly persistenceApplied: boolean
  readonly attempted: number
  readonly processed: number
  readonly changed: number
  readonly unchanged: number
  readonly failed: number
  readonly parseFailed: number
  readonly sourceMissingSoft: number
  readonly placeholderResolved: number
  readonly unsupportedSource: number
  readonly refreshCapabilityServer: number
  readonly refreshCapabilityExtension: number
  readonly refreshCapabilityUnsupported: number
  readonly salesSyncAttempted: number
  readonly salesSyncUpdated: number
  readonly salesSyncSkipped: number
  readonly descriptionsUpdated: number
  readonly imagesUpdated: number
  readonly schedulesUpdated: number
  readonly titlesUpdated: number
  readonly manualReviewRequired: number
  readonly durationMs: number
  /** False when reconciliation_candidate_rows_page failed (cursor not advanced remotely). */
  readonly candidatePageRpcOk?: boolean
  readonly candidatePageRpcErrorCode?: string | null
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.runSummary, {
      ...(fields.telemetryContext ?? {}),
      runMode: fields.runMode,
      dryRun: fields.dryRun,
      applySafeSync: fields.applySafeSync,
      persistenceApplied: fields.persistenceApplied,
      attempted: fields.attempted,
      processed: fields.processed,
      changed: fields.changed,
      unchanged: fields.unchanged,
      failed: fields.failed,
      parseFailed: fields.parseFailed,
      sourceMissingSoft: fields.sourceMissingSoft,
      placeholderResolved: fields.placeholderResolved,
      unsupportedSource: fields.unsupportedSource,
      refreshCapabilityServer: fields.refreshCapabilityServer,
      refreshCapabilityExtension: fields.refreshCapabilityExtension,
      refreshCapabilityUnsupported: fields.refreshCapabilityUnsupported,
      salesSyncAttempted: fields.salesSyncAttempted,
      salesSyncUpdated: fields.salesSyncUpdated,
      salesSyncSkipped: fields.salesSyncSkipped,
      descriptionsUpdated: fields.descriptionsUpdated,
      imagesUpdated: fields.imagesUpdated,
      schedulesUpdated: fields.schedulesUpdated,
      titlesUpdated: fields.titlesUpdated,
      manualReviewRequired: fields.manualReviewRequired,
      durationMs: fields.durationMs,
      candidatePageRpcOk: fields.candidatePageRpcOk ?? true,
      candidatePageRpcErrorCode: fields.candidatePageRpcErrorCode ?? null,
    })
  )
}

/** Companion aggregate when candidate RPC fails (explicit alert hook; no payloads). */
export function emitReconciliationCandidatePageRpcFailure(fields: {
  readonly errorCode: string
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.candidatePageRpcFailure, {
      ...(fields.telemetryContext ?? {}),
      errorCode: fields.errorCode,
    })
  )
}

export function emitReconciliationSalesSyncApplied(fields: {
  readonly salesSyncUpdated: number
  readonly descriptionsUpdated: number
  readonly imagesUpdated: number
  readonly schedulesUpdated: number
  readonly titlesUpdated: number
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.salesSyncApplied, {
      ...(fields.telemetryContext ?? {}),
      salesSyncUpdated: fields.salesSyncUpdated,
      descriptionsUpdated: fields.descriptionsUpdated,
      imagesUpdated: fields.imagesUpdated,
      schedulesUpdated: fields.schedulesUpdated,
      titlesUpdated: fields.titlesUpdated,
    })
  )
}

export function emitReconciliationSalesSyncSkipped(fields: {
  readonly salesSyncSkipped: number
  readonly salesSyncAttempted: number
  readonly telemetryContext?: Record<string, unknown>
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.reconciliation.salesSyncSkipped, {
      ...(fields.telemetryContext ?? {}),
      salesSyncSkipped: fields.salesSyncSkipped,
      salesSyncAttempted: fields.salesSyncAttempted,
    })
  )
}
