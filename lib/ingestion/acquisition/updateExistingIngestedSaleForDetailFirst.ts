import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { DetailFirstIngestedSaleWriteRow } from '@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst'

/**
 * Updates an existing ingested_sales row from a detail-first refresh (Phase 4).
 * Unlike promoteExistingIngestedSaleForDetailFirst, allows published rows and any non-duplicate status.
 */
export async function updateExistingIngestedSaleForDetailFirst(
  admin: ReturnType<typeof getAdminDb>,
  input: {
    ingestedSaleId: string
    row: DetailFirstIngestedSaleWriteRow
  }
): Promise<{ id: string } | null> {
  const id = input.ingestedSaleId.trim()
  if (!id) return null

  const now = new Date().toISOString()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({
      ...input.row,
      last_source_sync_at: now,
      source_sync_status: 'synced',
      updated_at: now,
    })
    .eq('id', id)
    .eq('is_duplicate', false)
    .neq('status', 'expired')
    .select('id, published_sale_id')
    .maybeSingle()

  if (error || !data?.id) {
    return null
  }

  return { id: String(data.id) }
}

export async function markIngestedSaleExpiredFromYstmRefresh(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({
      status: 'expired',
      failure_reasons: ['sale_expired'],
      last_source_sync_at: now,
      source_sync_status: 'source_missing_soft',
      updated_at: now,
    })
    .eq('id', ingestedSaleId)
    .eq('is_duplicate', false)
    .select('id')
    .maybeSingle()
  if (error || !data?.id) return false
  return true
}
