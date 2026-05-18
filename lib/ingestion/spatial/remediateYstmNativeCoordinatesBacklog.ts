import { z } from 'zod'
import {
  runNativeCoordinateRemediation,
  type NativeCoordinateRemediationSummary,
} from '@/lib/ingestion/nativeCoordinateRemediationWorker'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const RemediateYstmNativeCoordinatesSchema = z.object({
  batchSize: z.number().int().min(1).max(100).default(75),
})

export type RemediateYstmNativeCoordinatesInput = z.infer<typeof RemediateYstmNativeCoordinatesSchema>

/** @deprecated shape kept for admin route compatibility */
export type RemediateYstmNativeCoordinatesSummary = {
  scanned: number
  promoted: number
  skipped: number
  fetchFailed: number
  noCoords: number
}

function toLegacySummary(worker: NativeCoordinateRemediationSummary): RemediateYstmNativeCoordinatesSummary {
  return {
    scanned: worker.claimed,
    promoted: worker.promoted,
    skipped: worker.skipped + worker.terminal,
    fetchFailed: worker.fetchFailed + worker.retryScheduled,
    noCoords: worker.fallbackToGeocode + worker.terminal,
  }
}

/**
 * Bounded admin backfill: uses the same claim + process path as cron (Phase 2B).
 */
export async function remediateYstmNativeCoordinatesBacklog(
  input: RemediateYstmNativeCoordinatesInput
): Promise<RemediateYstmNativeCoordinatesSummary> {
  const parsed = RemediateYstmNativeCoordinatesSchema.parse(input)
  const worker = await runNativeCoordinateRemediation({
    batchSizeOverride: parsed.batchSize,
    claimedBy: 'admin_remediate_ystm_native',
    telemetryContext: { jobType: 'admin.remediate_ystm_native' },
  })
  const summary = toLegacySummary(worker)

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.spatialRemediationBatch, {
      scanned: summary.scanned,
      promoted: summary.promoted,
      skipped: summary.skipped,
      fetchFailed: summary.fetchFailed,
      noCoords: summary.noCoords,
    })
  )

  return summary
}
