import { z } from 'zod'
import {
  runBackfillCanonicalSaleInstanceKey,
  type BackfillCanonicalSaleInstanceKeyMetrics,
} from '@/lib/ingestion/identity/backfillCanonicalSaleInstanceKey'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const RemediateCanonicalSaleInstanceKeySchema = z.object({
  batchSize: z.number().int().min(1).max(500).optional(),
  dryRun: z.boolean().optional(),
  maxRows: z.number().int().min(1).max(50_000).optional(),
  resumeAfterId: z.string().uuid().nullable().optional(),
})

export type RemediateCanonicalSaleInstanceKeyInput = z.infer<
  typeof RemediateCanonicalSaleInstanceKeySchema
>

export async function remediateCanonicalSaleInstanceKeyBacklog(
  input: RemediateCanonicalSaleInstanceKeyInput
): Promise<BackfillCanonicalSaleInstanceKeyMetrics> {
  const parsed = RemediateCanonicalSaleInstanceKeySchema.parse(input)
  const metrics = await runBackfillCanonicalSaleInstanceKey({
    batchSize: parsed.batchSize,
    dryRun: parsed.dryRun,
    maxRows: parsed.maxRows,
    resumeAfterId: parsed.resumeAfterId ?? null,
    logOperation: 'admin_remediate_canonical_sale_instance_key',
  })

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.canonicalSaleInstanceKeyBackfillBatch, {
      operation: 'admin_remediate_canonical_sale_instance_key_complete',
      ...metrics,
    })
  )

  return metrics
}
