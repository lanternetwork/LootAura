import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmCatalogRepairOutcome =
  | 'published'
  | 'geocoded'
  | 'refreshed_ready'
  | 'marked_expired'
  | 'skipped_not_eligible'
  | 'failed'

export async function recordYstmCatalogRepairOutcome(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string,
  patch: {
    outcome: YstmCatalogRepairOutcome
    failureReason?: string | null
  }
): Promise<void> {
  const { error } = await fromBase(admin, 'ingested_sales')
    .update({
      catalog_repair_attempted_at: new Date().toISOString(),
      catalog_repair_outcome: patch.outcome,
      catalog_repair_failure_reason: patch.failureReason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ingestedSaleId)
  if (error) {
    throw new Error(error.message)
  }
}

export type YstmCatalogRepairAggregate = {
  repairQueueTotal: number
  needsGeocode: number
  readyUnpublished: number
  publishFailed: number
  needsCheck: number
  repairedPublishedLast24h: number
  repairFailed: number
}
