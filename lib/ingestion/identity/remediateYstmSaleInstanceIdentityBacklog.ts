import { z } from 'zod'
import {
  runBackfillYstmSaleInstanceIdentity,
  type BackfillYstmSaleInstanceIdentityMetrics,
} from '@/lib/ingestion/identity/backfillYstmSaleInstanceIdentity'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const RemediateYstmSaleInstanceIdentitySchema = z.object({
  batchSize: z.number().int().min(1).max(500).default(100),
  dryRun: z.boolean().default(false),
  maxRows: z.number().int().min(1).max(50_000).optional(),
  resumeAfterId: z.string().trim().min(1).nullable().optional(),
})

export type RemediateYstmSaleInstanceIdentityInput = z.infer<typeof RemediateYstmSaleInstanceIdentitySchema>

/**
 * Bounded admin backfill for Phase 12 sale-instance identity on ingested_sales.
 */
export async function remediateYstmSaleInstanceIdentityBacklog(
  input: RemediateYstmSaleInstanceIdentityInput
): Promise<BackfillYstmSaleInstanceIdentityMetrics> {
  const parsed = RemediateYstmSaleInstanceIdentitySchema.parse(input)
  const metrics = await runBackfillYstmSaleInstanceIdentity({
    batchSize: parsed.batchSize,
    dryRun: parsed.dryRun,
    maxRows: parsed.maxRows,
    resumeAfterId: parsed.resumeAfterId ?? null,
    logOperation: 'admin_remediate_ystm_sale_instance_identity',
  })

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.saleInstanceIdentityBackfillBatch, {
      dryRun: metrics.dryRun,
      processed: metrics.processed,
      rowsBackfilled: metrics.rowsBackfilled,
      aliasesRecorded: metrics.aliasesRecorded,
      keyCollisions: metrics.keyCollisions,
      urlReuseConflicts: metrics.urlReuseConflicts,
      ambiguousRows: metrics.ambiguousRows,
      missingDate: metrics.missingDate,
      missingLocation: metrics.missingLocation,
    })
  )

  return metrics
}
