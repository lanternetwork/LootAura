import type { SoftDuplicateEvaluation } from '@/lib/ingestion/duplicateScoring'
import { logger } from '@/lib/log'
import { fromBase, type getAdminDb } from '@/lib/supabase/clients'
import { buildSoftDedupeSuppressionReason } from '@/lib/ingestion/identity/softDedupeSafety'

export type RecordSoftDedupeSuppressionInput = {
  context: 'external_list_insert_skip' | 'ingested_sale_soft_match'
  sourcePlatform: string
  sourceUrl: string
  duplicateOfId: string
  evaluation: SoftDuplicateEvaluation
  suppressionReason: string
  incomingSaleInstanceKey: string | null
  matchedSaleInstanceKey: string | null
}

export async function recordIngestedSaleSoftDedupeSuppression(
  admin: ReturnType<typeof getAdminDb>,
  input: RecordSoftDedupeSuppressionInput
): Promise<void> {
  const breakdown = input.evaluation.bestBreakdown
  if (!breakdown) return

  const { error } = await fromBase(admin, 'ingested_sale_soft_dedupe_suppressions').insert({
    context: input.context,
    source_platform: input.sourcePlatform,
    source_url: input.sourceUrl,
    duplicate_of_ingested_sale_id: input.duplicateOfId,
    score: input.evaluation.bestScore,
    score_breakdown: breakdown,
    suppression_reason: input.suppressionReason,
    incoming_sale_instance_key: input.incomingSaleInstanceKey,
    matched_sale_instance_key: input.matchedSaleInstanceKey,
  })

  if (error) {
    logger.warn('Soft dedupe suppression evidence insert failed', {
      component: 'ingestion/identity/recordSoftDedupeSuppression',
      operation: 'insert_suppression_evidence',
      message: error.message,
      duplicateOfId: input.duplicateOfId,
      sourceUrl: input.sourceUrl,
    })
  }
}

export function suppressionReasonFromEvaluation(
  evaluation: SoftDuplicateEvaluation,
  skipKind: string | null
): string {
  return buildSoftDedupeSuppressionReason(evaluation.confidence, skipKind)
}
