import type { SaleInstanceShadowReplayRow } from '@/lib/ingestion/ystmCoverage/saleInstanceShadowReplayTypes'
import { fromBase, type getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export async function persistSaleInstanceShadowReplays(
  admin: ReturnType<typeof getAdminDb>,
  rows: readonly SaleInstanceShadowReplayRow[]
): Promise<void> {
  if (rows.length === 0) return

  const chunkSize = 50
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const payload = chunk.map((row) => ({
      canonical_url: row.canonicalUrl,
      state: row.state,
      city: row.city,
      replayed_at: row.replayedAt,
      old_decision: row.comparison.oldDecision,
      new_decision: row.comparison.newDecision,
      old_would_suppress: row.comparison.oldWouldSuppress,
      new_would_suppress: row.comparison.newWouldSuppress,
      would_publish: row.comparison.wouldPublish,
      would_create_new_instance: row.comparison.wouldCreateNewInstance,
      confidence: row.comparison.confidence,
      reason_codes: row.comparison.reasonCodes,
      old_skip_sub_reason: row.comparison.oldSkipSubReason,
      divergence_kind: row.comparison.divergenceKind,
      ingested_sale_id: row.ingestedSaleId,
      sale_instance_key: row.comparison.saleInstanceKey,
    }))

    const { error } = await fromBase(admin, 'ystm_sale_instance_shadow_replays').upsert(payload, {
      onConflict: 'canonical_url',
    })

    if (error) {
      logger.warn('Sale instance shadow replay persist failed', {
        component: 'ingestion/ystmCoverage/persistSaleInstanceShadowReplay',
        operation: 'upsert',
        message: error.message,
        chunkSize: chunk.length,
      })
    }
  }
}
